export interface Duplex {
  /**
   * Hand one JSON text frame to the pipe. Return a promise only when the pipe
   * is above its write high-water mark: the sender then pauses its producer
   * until it resolves, so a slow peer slows the producer instead of growing a
   * buffer. The promise must settle when the duplex closes; a rejection
   * closes the session. A sync return means "no backpressure signal".
   */
  send(text: string): void | Promise<void>
  onMessage(handler: (text: string) => void): () => void
  onClose(handler: (reason?: unknown) => void): () => void
  close(reason?: unknown): void
  /**
   * Optional. Stop delivering `onMessage` until `resume()`; the receiving side
   * calls them when a per-call queue crosses its high-water mark (pausing is
   * connection-wide). Omit both when the pipe cannot pause.
   */
  pause?(): void
  resume?(): void
}

type MessageHandler = (text: string) => void
type CloseHandler = (reason?: unknown) => void

function subscribe<T>(handlers: Set<T>, handler: T): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

function emitClose(handlers: Set<CloseHandler>, reason: unknown): unknown {
  let firstError: unknown
  for (const handler of [...handlers]) {
    try {
      if (reason === undefined) {
        handler()
      } else {
        handler(reason)
      }
    } catch (error) {
      firstError ??= error
    }
  }
  return firstError
}

/** One end's inbox: frames sent to it that its handlers have not received yet. */
type Inbox = {
  handlers: Set<MessageHandler>
  closes: Set<CloseHandler>
  queue: string[]
  bytes: number
  paused: boolean
  flushScheduled: boolean
  drains: (() => void)[]
}

function createInbox(): Inbox {
  return {
    handlers: new Set(),
    closes: new Set(),
    queue: [],
    bytes: 0,
    paused: false,
    flushScheduled: false,
    drains: [],
  }
}

/**
 * Two in-memory `Duplex` ends. Delivery is deferred one microtask, so `send`
 * never re-enters the current `onMessage`. With `highWaterMark`, a `send`
 * returns a drain promise while the receiving end holds more than that many
 * characters undelivered (because it is paused), which is how tests simulate
 * a slow peer. Without it `send` is always synchronous.
 */
export function createMemoryDuplex(options: { highWaterMark?: number } = {}): {
  a: Duplex
  b: Duplex
} {
  const toA = createInbox()
  const toB = createInbox()
  let closed = false

  const settleDrains = (inbox: Inbox): void => {
    const waiters = inbox.drains
    inbox.drains = []
    for (const resolve of waiters) {
      resolve()
    }
  }

  const flush = (inbox: Inbox): void => {
    inbox.flushScheduled = false
    // `closed` gates new sends and resumes, not frames queued before close.
    while (!inbox.paused && inbox.queue.length > 0) {
      const text = inbox.queue.shift() as string
      inbox.bytes -= text.length
      for (const handler of [...inbox.handlers]) {
        handler(text)
      }
    }
    if (
      options.highWaterMark === undefined ||
      inbox.bytes <= options.highWaterMark
    ) {
      settleDrains(inbox)
    }
  }

  const scheduleFlush = (inbox: Inbox): void => {
    if (inbox.flushScheduled || inbox.paused) {
      return
    }
    inbox.flushScheduled = true
    queueMicrotask(() => {
      flush(inbox)
    })
  }

  const sendTo = (inbox: Inbox, text: string): void | Promise<void> => {
    if (closed) {
      return undefined
    }
    inbox.queue.push(text)
    inbox.bytes += text.length
    scheduleFlush(inbox)
    if (
      options.highWaterMark !== undefined &&
      inbox.bytes > options.highWaterMark
    ) {
      return new Promise<void>((resolve) => {
        inbox.drains.push(resolve)
      })
    }
    return undefined
  }

  const close = (reason?: unknown): void => {
    if (closed) {
      return
    }
    closed = true
    // FIFO with send: already-queued messages deliver before onClose.
    queueMicrotask(() => {
      settleDrains(toA)
      settleDrains(toB)
      const aError = emitClose(toA.closes, reason)
      const bError = emitClose(toB.closes, reason)
      const error = aError ?? bError
      if (error !== undefined) {
        throw error
      }
    })
  }

  const end = (inbox: Inbox, peer: Inbox): Duplex => ({
    send: (text) => sendTo(peer, text),
    onMessage: (handler) => subscribe(inbox.handlers, handler),
    onClose: (handler) => subscribe(inbox.closes, handler),
    close,
    pause: () => {
      inbox.paused = true
    },
    resume: () => {
      inbox.paused = false
      if (!closed) {
        scheduleFlush(inbox)
      }
    },
  })

  return { a: end(toA, toB), b: end(toB, toA) }
}
