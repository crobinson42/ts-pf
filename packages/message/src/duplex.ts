export interface Duplex {
  send(text: string): void
  onMessage(handler: (text: string) => void): () => void
  onClose(handler: (reason?: unknown) => void): () => void
  close(reason?: unknown): void
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

export function createMemoryDuplex(): { a: Duplex; b: Duplex } {
  const aMessages = new Set<MessageHandler>()
  const bMessages = new Set<MessageHandler>()
  const aCloses = new Set<CloseHandler>()
  const bCloses = new Set<CloseHandler>()
  let closed = false

  const sendTo = (handlers: Set<MessageHandler>, text: string): void => {
    if (closed) {
      return
    }
    // queueMicrotask: send must not re-enter the current onMessage.
    queueMicrotask(() => {
      for (const handler of [...handlers]) {
        handler(text)
      }
    })
  }

  const close = (reason?: unknown): void => {
    if (closed) {
      return
    }
    closed = true
    // FIFO with send: already-queued messages deliver before onClose.
    queueMicrotask(() => {
      const aError = emitClose(aCloses, reason)
      const bError = emitClose(bCloses, reason)
      const error = aError ?? bError
      if (error !== undefined) {
        throw error
      }
    })
  }

  const a: Duplex = {
    send: (text) => sendTo(bMessages, text),
    onMessage: (handler) => subscribe(aMessages, handler),
    onClose: (handler) => subscribe(aCloses, handler),
    close,
  }

  const b: Duplex = {
    send: (text) => sendTo(aMessages, text),
    onMessage: (handler) => subscribe(bMessages, handler),
    onClose: (handler) => subscribe(bCloses, handler),
    close,
  }

  return { a, b }
}
