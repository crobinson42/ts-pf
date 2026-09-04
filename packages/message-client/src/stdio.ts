import type { Readable, Writable } from 'node:stream'
import type { Link } from '@ts-pf/client'
import { createStdioDuplex } from '@ts-pf/message/stdio'
import { attachClient, type LinkOptions } from './shared.js'

// child (handler)
// new StdioHandler(app).bind({ input: process.stdin, output: process.stdout }, { context })
// parent (link)
// const child = spawn(cmd, { stdio: ['pipe', 'pipe', 'inherit'] })
// new StdioLink({ input: child.stdout, output: child.stdin })

export class StdioLink implements Link {
  private readonly attached: ReturnType<typeof attachClient>
  private closed = false

  constructor(opts: { input: Readable; output: Writable } & LinkOptions) {
    const duplexOpts: { maxFrameBytes?: number } = {}
    if (opts.maxFrameBytes !== undefined) {
      duplexOpts.maxFrameBytes = opts.maxFrameBytes
    }
    const duplex = createStdioDuplex(
      { input: opts.input, output: opts.output },
      duplexOpts,
    )
    const attach: Parameters<typeof attachClient>[0] = { duplex }
    if (opts.meta !== undefined) {
      attach.meta = opts.meta
    }
    if (opts.maxFrameBytes !== undefined) {
      attach.maxFrameBytes = opts.maxFrameBytes
    }
    if (opts.helloTimeoutMs !== undefined) {
      attach.helloTimeoutMs = opts.helloTimeoutMs
    }
    this.attached = attachClient(attach)
  }

  call(
    path: string[],
    input: unknown,
    signal?: AbortSignal,
  ): ReturnType<Link['call']> {
    return this.attached.call(path, input, signal)
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.attached.close()
  }
}
