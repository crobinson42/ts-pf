import type { Readable, Writable } from 'node:stream'
import type { Link } from '@ts-pf/client'
import { createStdioDuplex } from '@ts-pf/message/stdio'
import { DuplexLink } from './duplex.js'
import type { LinkOptions } from './shared.js'

// child (handler)
// new StdioHandler(app).bind({ input: process.stdin, output: process.stdout }, { context })
// parent (link)
// const child = spawn(cmd, { stdio: ['pipe', 'pipe', 'inherit'] })
// new StdioLink({ input: child.stdout, output: child.stdin })

/** `DuplexLink` over `createStdioDuplex`. */
export class StdioLink implements Link {
  private readonly link: DuplexLink
  private closed = false

  constructor(opts: { input: Readable; output: Writable } & LinkOptions) {
    const { input, output, ...options } = opts
    const duplexOpts: { maxFrameBytes?: number } = {}
    if (options.maxFrameBytes !== undefined) {
      duplexOpts.maxFrameBytes = options.maxFrameBytes
    }
    const duplex = createStdioDuplex({ input, output }, duplexOpts)
    this.link = new DuplexLink({ duplex, ...options })
  }

  call(
    path: string[],
    input: unknown,
    signal?: AbortSignal,
  ): ReturnType<Link['call']> {
    return this.link.call(path, input, signal)
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.link.close()
  }
}
