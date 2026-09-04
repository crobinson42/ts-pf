import type { Link } from '@ts-pf/client'
import { createPortDuplex } from '@ts-pf/message'
import { attachClient, type LinkOptions } from './shared.js'

export class PortLink implements Link {
  private readonly attached: ReturnType<typeof attachClient>
  private readonly port: MessagePort
  private closed = false

  constructor(opts: { port: MessagePort } & LinkOptions) {
    this.port = opts.port
    const duplex = createPortDuplex(opts.port)
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
    opts.port.start()
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
    try {
      this.port.close()
    } catch {
      // already disconnected
    }
  }
}
