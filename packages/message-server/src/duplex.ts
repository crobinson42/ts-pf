import type { Duplex } from '@ts-pf/message'
import type { ImplementedRouter } from '@ts-pf/server'
import { attachRouter, type HandlerOptions } from './shared.js'

/**
 * Serves `app` over any `Duplex` from `@ts-pf/message`: write one for your
 * pipe (Electron IPC, a Chrome runtime port, WebTransport, a Unix socket)
 * and bind it here. `PortHandler` / `WsHandler` / `StdioHandler` are this
 * plus their duplex adapter. The handler owns the handshake, multiplexing,
 * and cancel; the duplex only moves JSON text.
 *
 * `TCtx` is inferred from the router's context brand (the `$context<C>()`
 * type behind `impl.router()`), so `bind(duplex, { context })` is checked
 * against it; see `FetchHandler`.
 */
export class DuplexHandler<TCtx = unknown> {
  constructor(
    private readonly router: ImplementedRouter<unknown, TCtx>,
    private readonly options?: HandlerOptions,
  ) {}

  bind(
    duplex: Duplex,
    opts: {
      context: TCtx | ((info: { meta?: unknown }) => TCtx | Promise<TCtx>)
    },
  ): { close(): void } {
    const attached = attachRouter({
      ...this.options,
      duplex,
      router: this.router,
      context: opts.context,
    })
    return {
      close() {
        attached.close()
      },
    }
  }
}
