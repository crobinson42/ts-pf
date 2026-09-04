import type { Readable, Writable } from 'node:stream'
import { createStdioDuplex } from '@ts-pf/message/stdio'
import type { ImplementedRouter } from '@ts-pf/server'
import { attachRouter, type HandlerOptions } from './shared.js'

// child (handler)
// new StdioHandler(app).bind({ input: process.stdin, output: process.stdout }, { context })
// parent (link)
// const child = spawn(cmd, { stdio: ['pipe', 'pipe', 'inherit'] })
// new StdioLink({ input: child.stdout, output: child.stdin })

export class StdioHandler<TCtx = unknown> {
  constructor(
    private readonly router: ImplementedRouter,
    private readonly options?: HandlerOptions,
  ) {}

  bind(
    streams: { input: Readable; output: Writable },
    opts: {
      context:
        | TCtx
        | ((info: {
            input: Readable
            output: Writable
            meta?: unknown
          }) => TCtx | Promise<TCtx>)
    },
  ): { close(): void } {
    const duplexOpts: { maxFrameBytes?: number } = {}
    if (this.options?.maxFrameBytes !== undefined) {
      duplexOpts.maxFrameBytes = this.options.maxFrameBytes
    }
    const duplex = createStdioDuplex(streams, duplexOpts)
    const context =
      typeof opts.context === 'function'
        ? (info: { meta?: unknown }) => {
            const factory = opts.context as (info: {
              input: Readable
              output: Writable
              meta?: unknown
            }) => TCtx | Promise<TCtx>
            return info.meta !== undefined
              ? factory({
                  input: streams.input,
                  output: streams.output,
                  meta: info.meta,
                })
              : factory({ input: streams.input, output: streams.output })
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
      },
    }
  }
}
