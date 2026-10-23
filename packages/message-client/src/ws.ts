import type { Link } from '@ts-pf/client'
import { createWsDuplex, type WebSocketLike } from '@ts-pf/message'
import { localFailure } from '@ts-pf/protocol'
import { DuplexLink } from './duplex.js'
import { awaitWithAbort, type LinkOptions } from './shared.js'

export type { WebSocketLike }

const WS_OPEN = 1
const WS_CLOSING = 2
const WS_CLOSED = 3

type WebSocketCtor = {
  new (url: string, protocols?: string | string[]): WebSocketLike
}

type WsLinkOpts =
  | ({ socket: WebSocketLike; url?: never; WebSocket?: never } & LinkOptions)
  | ({
      url: string
      socket?: never
      WebSocket?: WebSocketCtor
    } & LinkOptions)

/**
 * `DuplexLink` over `createWsDuplex`, started once the socket is open.
 * Calls made before that wait for the connect; `close()` also closes the socket.
 */
export class WsLink implements Link {
  private readonly socket: WebSocketLike
  private link: DuplexLink | undefined
  private readonly connected: Promise<DuplexLink>
  private closed = false
  private settleConnect:
    | {
        resolve: (value: DuplexLink) => void
        reject: (reason: unknown) => void
      }
    | undefined
  private unsubConnect: (() => void) | undefined

  constructor(opts: WsLinkOpts) {
    const socketOpt = 'socket' in opts ? opts.socket : undefined
    const urlOpt = 'url' in opts ? opts.url : undefined
    if ((socketOpt !== undefined) === (urlOpt !== undefined)) {
      throw new TypeError('WsLink requires exactly one of socket or url')
    }

    if (urlOpt !== undefined) {
      const Ctor = opts.WebSocket ?? globalThis.WebSocket
      if (typeof Ctor !== 'function') {
        throw new TypeError('WsLink url requires WebSocket')
      }
      this.socket = new Ctor(urlOpt)
    } else {
      this.socket = socketOpt as WebSocketLike
    }

    this.connected = new Promise((resolve, reject) => {
      this.settleConnect = { resolve, reject }
    })
    void this.connected.catch(() => {
      // connect / hello failures reject ready; call() re-awaits the same promise
    })

    const linkOpts: LinkOptions = {}
    if (opts.meta !== undefined) {
      linkOpts.meta = opts.meta
    }
    if (opts.maxFrameBytes !== undefined) {
      linkOpts.maxFrameBytes = opts.maxFrameBytes
    }
    if (opts.helloTimeoutMs !== undefined) {
      linkOpts.helloTimeoutMs = opts.helloTimeoutMs
    }
    this.boot(linkOpts)
  }

  call(
    path: string[],
    input: unknown,
    signal?: AbortSignal,
  ): ReturnType<Link['call']> {
    return this.callInner(path, input, signal) as ReturnType<Link['call']>
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.unsubConnect?.()
    this.unsubConnect = undefined
    this.link?.close()
    this.failConnect(localFailure('Connection closed'))
    try {
      this.socket.close(1000)
    } catch {
      // already disconnected
    }
  }

  private boot(opts: LinkOptions): void {
    const socket = this.socket
    if (socket.readyState === WS_OPEN) {
      this.start(opts)
      return
    }
    if (socket.readyState === WS_CLOSING || socket.readyState === WS_CLOSED) {
      this.failConnect(localFailure('Connection closed'))
      return
    }

    const onOpen = (): void => {
      this.unsubConnect?.()
      this.unsubConnect = undefined
      this.start(opts)
    }
    const onError = (ev: { data?: unknown }): void => {
      this.unsubConnect?.()
      this.unsubConnect = undefined
      this.failConnect(localFailure('Network error', ev))
    }
    const onClose = (): void => {
      this.unsubConnect?.()
      this.unsubConnect = undefined
      this.failConnect(localFailure('Connection closed'))
    }
    this.unsubConnect = () => {
      socket.removeEventListener('open', onOpen)
      socket.removeEventListener('error', onError)
      socket.removeEventListener('close', onClose)
    }
    socket.addEventListener('open', onOpen)
    socket.addEventListener('error', onError)
    socket.addEventListener('close', onClose)
  }

  private start(opts: LinkOptions): void {
    if (this.closed) {
      return
    }
    const link = new DuplexLink({
      duplex: createWsDuplex(this.socket),
      ...opts,
    })
    this.link = link
    this.settleConnect?.resolve(link)
    this.settleConnect = undefined
  }

  private failConnect(error: unknown): void {
    if (this.settleConnect === undefined) {
      return
    }
    this.settleConnect.reject(error)
    this.settleConnect = undefined
  }

  private async callInner(
    path: string[],
    input: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const link = await awaitWithAbort(this.connected, signal)
    return link.call(path, input, signal)
  }
}
