import { createWsDuplex, type WebSocketLike } from '@ts-pf/message'
import type { ImplementedRouter } from '@ts-pf/server'
import { attachRouter, type HandlerOptions } from './shared.js'

export type { WebSocketLike }

export class WsHandler<TCtx = unknown> {
  constructor(
    private readonly router: ImplementedRouter,
    private readonly options?: HandlerOptions,
  ) {}

  bind(
    socket: WebSocketLike,
    opts: {
      context:
        | TCtx
        | ((info: {
            socket: WebSocketLike
            meta?: unknown
          }) => TCtx | Promise<TCtx>)
    },
  ): { close(): void } {
    const duplex = createWsDuplex(socket)
    const context =
      typeof opts.context === 'function'
        ? (info: { meta?: unknown }) => {
            const factory = opts.context as (info: {
              socket: WebSocketLike
              meta?: unknown
            }) => TCtx | Promise<TCtx>
            return info.meta !== undefined
              ? factory({ socket, meta: info.meta })
              : factory({ socket })
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

    let closed = false
    return {
      close() {
        if (closed) {
          return
        }
        closed = true
        attached.close()
        try {
          socket.close(1000)
        } catch {
          // already disconnected
        }
      },
    }
  }
}
