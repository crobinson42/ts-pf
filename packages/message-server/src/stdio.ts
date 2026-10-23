import type { Readable, Writable } from 'node:stream'
import { createStdioDuplex } from '@ts-pf/message/stdio'
import type { ImplementedRouter } from '@ts-pf/server'
import { DuplexHandler } from './duplex.js'
import { contextWithInfo, type HandlerOptions } from './shared.js'

// child (handler)
// new StdioHandler(app).bind({ input: process.stdin, output: process.stdout }, { context })
// parent (link)
// const child = spawn(cmd, { stdio: ['pipe', 'pipe', 'inherit'] })
// new StdioLink({ input: child.stdout, output: child.stdin })

/** `DuplexHandler` over `createStdioDuplex`. `TCtx` is inferred from the router's context brand; see `FetchHandler`. */
export class StdioHandler<TCtx = unknown> {
  private readonly handler: DuplexHandler<TCtx>
  private readonly maxFrameBytes: number | undefined

  constructor(
    router: ImplementedRouter<unknown, TCtx>,
    options?: HandlerOptions,
  ) {
    this.handler = new DuplexHandler(router, options)
    this.maxFrameBytes = options?.maxFrameBytes
  }

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
    if (this.maxFrameBytes !== undefined) {
      duplexOpts.maxFrameBytes = this.maxFrameBytes
    }
    const duplex = createStdioDuplex(streams, duplexOpts)
    const attached = this.handler.bind(duplex, {
      context: contextWithInfo(opts.context, {
        input: streams.input,
        output: streams.output,
      }),
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
