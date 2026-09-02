import type { Duplex } from '@ts-pf/message'
import type { ImplementedRouter } from '@ts-pf/server'
import { attachRouter, type HandlerOptions } from './shared.js'

function createPortDuplex(port: MessagePort): Duplex {
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

export class PortHandler<TCtx = unknown> {
  constructor(
    private readonly router: ImplementedRouter,
    private readonly options?: HandlerOptions,
  ) {}

  bind(
    port: MessagePort,
    opts: {
      context:
        | TCtx
        | ((info: {
            port: MessagePort
            meta?: unknown
          }) => TCtx | Promise<TCtx>)
    },
  ): { close(): void } {
    const duplex = createPortDuplex(port)
    const context =
      typeof opts.context === 'function'
        ? (info: { meta?: unknown }) => {
            const factory = opts.context as (info: {
              port: MessagePort
              meta?: unknown
            }) => TCtx | Promise<TCtx>
            return info.meta !== undefined
              ? factory({ port, meta: info.meta })
              : factory({ port })
          }
        : opts.context

    const attached = attachRouter({
      duplex,
      router: this.router,
      context,
      ...(this.options?.maxFrameBytes !== undefined
        ? { maxFrameBytes: this.options.maxFrameBytes }
        : {}),
      ...(this.options?.helloTimeoutMs !== undefined
        ? { helloTimeoutMs: this.options.helloTimeoutMs }
        : {}),
      ...(this.options?.onError !== undefined
        ? { onError: this.options.onError }
        : {}),
    })
    port.start()

    let closed = false
    return {
      close() {
        if (closed) {
          return
        }
        closed = true
        attached.close()
        port.close()
      },
    }
  }
}
