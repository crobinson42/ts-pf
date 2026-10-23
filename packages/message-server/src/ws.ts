import {
  createWsDuplex,
  resolveBackpressure,
  type WebSocketLike,
} from '@ts-pf/message'
import type { ImplementedRouter } from '@ts-pf/server'
import { DuplexHandler } from './duplex.js'
import { contextWithInfo, type HandlerOptions } from './shared.js'

export type { WebSocketLike }

/**
 * `DuplexHandler` over `createWsDuplex`. `TCtx` is inferred from the router's
 * context brand; see `FetchHandler`. `backpressure.highWaterMark` is the
 * `bufferedAmount` the socket may hold before a stream's producer pauses.
 */
export class WsHandler<TCtx = unknown> {
  private readonly handler: DuplexHandler<TCtx>
  private readonly highWaterMark: number

  constructor(
    router: ImplementedRouter<unknown, TCtx>,
    options?: HandlerOptions,
  ) {
    this.handler = new DuplexHandler(router, options)
    this.highWaterMark = resolveBackpressure(
      options?.backpressure,
    ).highWaterMark
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
    const duplex = createWsDuplex(socket, { highWaterMark: this.highWaterMark })
    const attached = this.handler.bind(duplex, {
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
