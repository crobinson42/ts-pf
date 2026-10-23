import { DEFAULT_HIGH_WATER_MARK } from './backpressure.js'
import type { Duplex } from './duplex.js'

export interface WebSocketLike {
  readonly readyState: number
  /**
   * Bytes queued by `send` but not yet handed to the network (WHATWG). When
   * present, `createWsDuplex` compares it with `highWaterMark` after each
   * send and returns a drain promise above it.
   */
  readonly bufferedAmount?: number
  send(data: string): void
  close(code?: number): void
  addEventListener(
    type: 'message' | 'open' | 'close' | 'error',
    handler: (ev: { data?: unknown }) => void,
  ): void
  removeEventListener(
    type: 'message' | 'open' | 'close' | 'error',
    handler: (ev: { data?: unknown }) => void,
  ): void
  /** Optional (npm `ws` has them; browsers do not): stop / restart `message` events. */
  pause?(): void
  resume?(): void
}

const WS_CONNECTING = 0
const WS_OPEN = 1
const WS_CLOSING = 2
const WS_CLOSED = 3

/** WebSockets have no drain event; `bufferedAmount` is polled at this interval while above the mark. */
const DRAIN_POLL_MS = 10

/**
 * A `Duplex` over a `WebSocket`-like socket. `send` returns a drain promise
 * while `socket.bufferedAmount` (when the socket exposes it) or the queue
 * held during `CONNECTING` exceeds `highWaterMark` (default 1 MiB); the
 * promise resolves when it drops back under the mark or the socket closes.
 * `pause` / `resume` are present only when the socket has them.
 */
export function createWsDuplex(
  socket: WebSocketLike,
  options: { highWaterMark?: number } = {},
): Duplex {
  const highWaterMark = options.highWaterMark ?? DEFAULT_HIGH_WATER_MARK
  const closeHandlers = new Set<(reason?: unknown) => void>()
  let closed =
    socket.readyState === WS_CLOSING || socket.readyState === WS_CLOSED
  const pending: string[] = []
  let pendingChars = 0
  let drainWaiters: (() => void)[] = []
  let poll: ReturnType<typeof setInterval> | undefined

  const aboveMark = (): boolean =>
    socket.bufferedAmount !== undefined && socket.bufferedAmount > highWaterMark

  const settleDrains = (): void => {
    if (poll !== undefined) {
      clearInterval(poll)
      poll = undefined
    }
    const waiters = drainWaiters
    drainWaiters = []
    for (const resolve of waiters) {
      resolve()
    }
  }

  const waitDrain = (): Promise<void> =>
    new Promise<void>((resolve) => {
      drainWaiters.push(resolve)
    })

  const pollDrain = (): void => {
    if (poll !== undefined) {
      return
    }
    poll = setInterval(() => {
      if (closed || !aboveMark()) {
        settleDrains()
      }
    }, DRAIN_POLL_MS)
  }

  const notifyClose = (reason?: unknown): void => {
    for (const handler of [...closeHandlers]) {
      if (reason === undefined) {
        handler()
      } else {
        handler(reason)
      }
    }
  }

  const close = (reason?: unknown): void => {
    if (closed) {
      return
    }
    closed = true
    pending.length = 0
    pendingChars = 0
    socket.removeEventListener('open', onOpen)
    socket.removeEventListener('close', onSocketClose)
    const code = reason === 1002 ? 1002 : 1000
    try {
      socket.close(code)
    } catch {
      // already disconnected
    }
    settleDrains()
    if (reason === undefined || reason === 1002) {
      notifyClose()
    } else {
      notifyClose(reason)
    }
  }

  const onOpen = (): void => {
    if (closed || socket.readyState !== WS_OPEN) {
      return
    }
    for (const text of pending) {
      socket.send(text)
    }
    pending.length = 0
    pendingChars = 0
    if (aboveMark()) {
      pollDrain()
    } else {
      settleDrains()
    }
  }

  const onSocketClose = (): void => {
    close()
  }

  if (socket.readyState === WS_CONNECTING) {
    socket.addEventListener('open', onOpen)
  }
  socket.addEventListener('close', onSocketClose)

  const duplex: Duplex = {
    send(text) {
      if (closed) {
        return undefined
      }
      if (socket.readyState === WS_CONNECTING) {
        pending.push(text)
        pendingChars += text.length
        return pendingChars > highWaterMark ? waitDrain() : undefined
      }
      if (socket.readyState !== WS_OPEN) {
        close()
        return undefined
      }
      socket.send(text)
      if (!aboveMark()) {
        return undefined
      }
      pollDrain()
      return waitDrain()
    },
    onMessage(handler) {
      const listener = (event: { data?: unknown }) => {
        if (typeof event.data !== 'string') {
          close(1002)
          return
        }
        handler(event.data)
      }
      socket.addEventListener('message', listener)
      return () => {
        socket.removeEventListener('message', listener)
      }
    },
    onClose(handler) {
      closeHandlers.add(handler)
      if (closed) {
        queueMicrotask(() => {
          handler()
        })
      }
      return () => {
        closeHandlers.delete(handler)
      }
    },
    close,
  }

  const pause = socket.pause?.bind(socket)
  const resume = socket.resume?.bind(socket)
  if (pause !== undefined && resume !== undefined) {
    duplex.pause = pause
    duplex.resume = resume
  }
  return duplex
}
