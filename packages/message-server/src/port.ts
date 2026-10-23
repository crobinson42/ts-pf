import { createPortDuplex } from '@ts-pf/message'
import type { ImplementedRouter } from '@ts-pf/server'
import { DuplexHandler } from './duplex.js'
import { contextWithInfo, type HandlerOptions } from './shared.js'

/** `DuplexHandler` over `createPortDuplex`. `TCtx` is inferred from the router's context brand; see `FetchHandler`. */
export class PortHandler<TCtx = unknown> {
  private readonly handler: DuplexHandler<TCtx>

  constructor(
    router: ImplementedRouter<unknown, TCtx>,
    options?: HandlerOptions,
  ) {
    this.handler = new DuplexHandler(router, options)
  }

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
    const attached = this.handler.bind(createPortDuplex(port), {
      context: contextWithInfo(opts.context, { port }),
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
