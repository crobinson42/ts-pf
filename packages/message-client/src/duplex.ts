import type { Link } from '@ts-pf/client'
import { type Duplex, type MessageFrame, MessageSession } from '@ts-pf/message'
import { localFailure } from '@ts-pf/protocol'
import { ClientCall, type ClientCallHost } from './call.js'
import { abortedFailure, awaitWithAbort, type LinkOptions } from './shared.js'

/**
 * A `Link` over any `Duplex` from `@ts-pf/message`: write one for your pipe
 * (Electron IPC, a Chrome runtime port, WebTransport, a Unix socket) and
 * hand it here. `PortLink` / `WsLink` / `StdioLink` are this plus their
 * duplex adapter. The link owns the handshake, id allocation, multiplexing,
 * and cancel; the duplex only moves JSON text. `close()` closes the duplex.
 */
export class DuplexLink implements Link {
  private readonly inflight = new Map<string, ClientCall>()
  private readonly host: ClientCallHost
  private readonly session: MessageSession
  private nextId = 1
  private closed = false

  constructor(opts: { duplex: Duplex } & LinkOptions) {
    this.host = {
      send: (frame) => this.session.send(frame),
      settle: (id) => {
        this.inflight.delete(id)
      },
    }
    this.session = new MessageSession({
      duplex: opts.duplex,
      role: 'client',
      ...(opts.maxFrameBytes !== undefined
        ? { maxFrameBytes: opts.maxFrameBytes }
        : {}),
      ...(opts.helloTimeoutMs !== undefined
        ? { helloTimeoutMs: opts.helloTimeoutMs }
        : {}),
      ...(opts.meta !== undefined ? { helloMeta: opts.meta } : {}),
      onFrame: (frame) => {
        this.onFrame(frame)
      },
      // decode failures never settle a call, in-flight or not
      onInvalidFrame: () => {},
      onClose: (reason) => {
        this.onClose(reason)
      },
    })
    void this.session.ready.catch(() => {
      // handshake / close rejects ready; call() re-awaits the same promise
    })
  }

  call(
    path: string[],
    input: unknown,
    signal?: AbortSignal,
  ): ReturnType<Link['call']> {
    return this.callInner(path, input, signal) as ReturnType<Link['call']>
  }

  close(): void {
    this.session.close()
  }

  private async callInner(
    path: string[],
    input: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    await awaitWithAbort(this.session.ready, signal)
    if (this.closed) {
      throw localFailure('Connection closed')
    }
    if (signal?.aborted) {
      throw abortedFailure(signal)
    }
    const id = String(this.nextId)
    this.nextId += 1
    return new Promise<unknown>((resolve, reject) => {
      const call = new ClientCall(id, this.host, resolve, reject)
      this.inflight.set(id, call)
      call.open(path, input, signal)
    })
  }

  /** `PROTOCOL.md` "Multiplex": frames route by id; a handshake frame after `ready` closes. */
  private onFrame(frame: MessageFrame): void {
    if (
      frame.type === 'hello' ||
      frame.type === 'hello-ok' ||
      frame.type === 'hello-error'
    ) {
      this.session.close()
      return
    }
    this.inflight.get(frame.id)?.onFrame(frame)
  }

  private onClose(reason?: unknown): void {
    this.closed = true
    const error =
      reason === undefined
        ? localFailure('Connection closed')
        : localFailure('Connection closed', reason)
    for (const call of [...this.inflight.values()]) {
      call.fail(error, false)
    }
  }
}
