import { createWsDuplex, type WebSocketLike } from '@ts-pf/message'
import type { ImplementedRouter } from '@ts-pf/server'
import { DuplexHandler } from './duplex.js'
import { contextWithInfo, type HandlerOptions } from './shared.js'

export type { WebSocketLike }

/** `DuplexHandler` over `createWsDuplex`. `TCtx` is inferred from the router's context brand; see `FetchHandler`. */
export class WsHandler<TCtx = unknown> {
  private readonly handler: DuplexHandler<TCtx>

  constructor(
    router: ImplementedRouter<unknown, TCtx>,
    options?: HandlerOptions,
  ) {
    this.handler = new DuplexHandler(router, options)
  }

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
    const attached = this.handler.bind(createWsDuplex(socket), {
      context: contextWithInfo(opts.context, { socket }),
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
