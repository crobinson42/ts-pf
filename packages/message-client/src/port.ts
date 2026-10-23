import type { Link } from '@ts-pf/client'
import { createPortDuplex } from '@ts-pf/message'
import { DuplexLink } from './duplex.js'
import type { LinkOptions } from './shared.js'

/** `DuplexLink` over `createPortDuplex`; `close()` also closes the port. */
export class PortLink implements Link {
  private readonly link: DuplexLink
  private readonly port: MessagePort
  private closed = false

  constructor(opts: { port: MessagePort } & LinkOptions) {
    const { port, ...options } = opts
    this.port = port
    this.link = new DuplexLink({ duplex: createPortDuplex(port), ...options })
    port.start()
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
    try {
      this.port.close()
    } catch {
      // already disconnected
    }
  }
}
