import {
  type Backpressure,
  type Duplex,
  resolveBackpressure,
} from '@ts-pf/message'
import type { ImplementedRouter } from '@ts-pf/server'
import { attachRouter, type HandlerOptions } from './shared.js'

/**
 * Serves `app` over any `Duplex` from `@ts-pf/message`: write one for your
 * pipe (Electron IPC, a Chrome runtime port, WebTransport, a Unix socket)
 * and bind it here. `PortHandler` / `WsHandler` / `StdioHandler` are this
 * plus their duplex adapter. The handler owns the handshake, multiplexing,
 * cancel, and slow-peer protection (`HandlerOptions.backpressure`); the
 * duplex only moves JSON text, and reports backpressure by returning a
 * promise from `send` and by implementing `pause` / `resume`.
 *
 * `TCtx` is inferred from the router's context brand (the `$context<C>()`
 * type behind `impl.router()`), so `bind(duplex, { context })` is checked
 * against it; see `FetchHandler`.
 */
export class DuplexHandler<TCtx = unknown> {
  private readonly backpressure: Backpressure

  constructor(
    private readonly router: ImplementedRouter<unknown, TCtx>,
    private readonly options?: HandlerOptions,
  ) {
    // validated here so a bad option throws at construction, not on bind()
    this.backpressure = resolveBackpressure(options?.backpressure)
  }

  bind(
    duplex: Duplex,
    opts: {
      context: TCtx | ((info: { meta?: unknown }) => TCtx | Promise<TCtx>)
    },
  ): { close(): void } {
    const attached = attachRouter({
      ...this.options,
      backpressure: this.backpressure,
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
