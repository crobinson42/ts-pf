import type { Duplex } from './duplex.js'

/**
 * A `Duplex` over a `MessagePort`. A port exposes no buffered amount and
 * cannot stop receiving, so this adapter reports no backpressure: `send` is
 * always synchronous and there is no `pause` / `resume`. Receive queues on
 * this pipe are bounded only by the peer's behaviour; a sender's producer is
 * paused only on pipes that do report (WebSocket `bufferedAmount`, stdio).
 */
export function createPortDuplex(port: MessagePort): Duplex {
  const closeHandlers = new Set<(reason?: unknown) => void>()
  let closed = false

  const close = (reason?: unknown): void => {
    if (closed) {
      return
    }
    closed = true
    try {
      port.close()
    } catch {
      // already disconnected
    }
    for (const handler of [...closeHandlers]) {
      if (reason === undefined) {
        handler()
      } else {
        handler(reason)
      }
    }
  }

  port.addEventListener('close', () => {
    close()
  })

  return {
    send(text) {
      if (closed) {
        return
      }
      port.postMessage(text)
    },
    onMessage(handler) {
      const listener = (event: MessageEvent) => {
        if (typeof event.data !== 'string') {
          close()
          return
        }
        handler(event.data)
      }
      port.addEventListener('message', listener)
      return () => {
        port.removeEventListener('message', listener)
      }
    },
    onClose(handler) {
      closeHandlers.add(handler)
      return () => {
        closeHandlers.delete(handler)
      }
    },
    close,
  }
}
