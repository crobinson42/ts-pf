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

  /**
   * The handle's `close(code?, reason?)` closes the socket with that WebSocket
   * close code (default `1000`) and reason, then tears the session down.
   * Application codes belong in 4400–4499 (`4401` unauthenticated, `4403`
   * forbidden, `4429` rate limited); 4900–4999 are reserved for the protocol.
   */
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
  ): { close(code?: number, reason?: string): void } {
    const duplex = createWsDuplex(socket, { highWaterMark: this.highWaterMark })
    const attached = this.handler.bind(duplex, {
      context: contextWithInfo(opts.context, { socket }),
    })

    let closed = false
    return {
      close(code = 1000, reason) {
        if (closed) {
          return
        }
        closed = true
        // The socket first, so this code and reason win: the session's own
        // close then calls `socket.close(1000)` on a closing socket, which
        // browser `WebSocket` and npm `ws` both ignore.
        try {
          socket.close(code, reason)
        } catch {
          // already disconnected
        }
        attached.close()
      },
    }
  }
}
