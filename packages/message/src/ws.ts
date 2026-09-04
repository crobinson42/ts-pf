import type { Duplex } from './duplex.js'

export interface WebSocketLike {
  readonly readyState: number
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
}

const WS_CONNECTING = 0
const WS_OPEN = 1
const WS_CLOSING = 2
const WS_CLOSED = 3

export function createWsDuplex(socket: WebSocketLike): Duplex {
  const closeHandlers = new Set<(reason?: unknown) => void>()
  let closed =
    socket.readyState === WS_CLOSING || socket.readyState === WS_CLOSED
  const pending: string[] = []

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
    socket.removeEventListener('open', onOpen)
    socket.removeEventListener('close', onSocketClose)
    const code = reason === 1002 ? 1002 : 1000
    try {
      socket.close(code)
    } catch {
      // already disconnected
    }
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
  }

  const onSocketClose = (): void => {
    close()
  }

  if (socket.readyState === WS_CONNECTING) {
    socket.addEventListener('open', onOpen)
  }
  socket.addEventListener('close', onSocketClose)

  return {
    send(text) {
      if (closed) {
        return
      }
      if (socket.readyState === WS_CONNECTING) {
        pending.push(text)
        return
      }
      if (socket.readyState !== WS_OPEN) {
        close()
        return
      }
      socket.send(text)
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
}
