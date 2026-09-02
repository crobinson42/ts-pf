import type { Link } from '@ts-pf/client'
import { type Duplex, localFailure } from '@ts-pf/message'
import { attachClient, type LinkOptions } from './shared.js'

export interface WebSocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number): void
  addEventListener(
    type: 'message' | 'open' | 'close' | 'error',
    handler: (ev: { data?: unknown }) => void,
  ): void
  removeEventListener(
    type: 'message' | 'open' | 'close' | 'error',
    handler: (ev: { data?: unknown }) => void,
  ): void
}

const WS_CONNECTING = 0
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

function createWsDuplex(socket: WebSocketLike): Duplex {
  const closeHandlers = new Set<(reason?: unknown) => void>()
  let closed =
    socket.readyState === WS_CLOSING || socket.readyState === WS_CLOSED
  const pending: string[] = []

  const notifyClose = (reason?: unknown): void => {
    for (const handler of [...closeHandlers]) {
      if (reason === undefined) {
        handler()
      } else {
        handler(reason)
      }
    }
  }

  const close = (reason?: unknown): void => {
    if (closed) {
      return
    }
    closed = true
    pending.length = 0
    socket.removeEventListener('open', onOpen)
    socket.removeEventListener('close', onSocketClose)
    const code = reason === 1002 ? 1002 : 1000
    try {
      socket.close(code)
    } catch {
      // already disconnected
    }
    if (reason === undefined || reason === 1002) {
      notifyClose()
    } else {
      notifyClose(reason)
    }
  }

  const onOpen = (): void => {
    if (closed || socket.readyState !== WS_OPEN) {
      return
    }
    for (const text of pending) {
      socket.send(text)
    }
    pending.length = 0
  }

  const onSocketClose = (): void => {
    close()
  }

  if (socket.readyState === WS_CONNECTING) {
    socket.addEventListener('open', onOpen)
  }
  socket.addEventListener('close', onSocketClose)

  return {
    send(text) {
      if (closed) {
        return
      }
      if (socket.readyState === WS_CONNECTING) {
        pending.push(text)
        return
      }
      if (socket.readyState !== WS_OPEN) {
        close()
        return
      }
      socket.send(text)
    },
    onMessage(handler) {
      const listener = (event: { data?: unknown }) => {
        if (typeof event.data !== 'string') {
          close(1002)
          return
        }
        handler(event.data)
      }
      socket.addEventListener('message', listener)
      return () => {
        socket.removeEventListener('message', listener)
      }
    },
    onClose(handler) {
      closeHandlers.add(handler)
      if (closed) {
        queueMicrotask(() => {
          handler()
        })
      }
      return () => {
        closeHandlers.delete(handler)
      }
    },
    close,
  }
}

function abortedFailure(signal: AbortSignal): ReturnType<typeof localFailure> {
  return signal.reason !== undefined
    ? localFailure('Request aborted', signal.reason)
    : localFailure('Request aborted')
}

export class WsLink implements Link {
  private readonly socket: WebSocketLike
  private attached: ReturnType<typeof attachClient> | undefined
  private readonly connected: Promise<ReturnType<typeof attachClient>>
  private closed = false
  private settleConnect:
    | {
        resolve: (value: ReturnType<typeof attachClient>) => void
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

    const attachOpts: LinkOptions = {}
    if (opts.meta !== undefined) {
      attachOpts.meta = opts.meta
    }
    if (opts.maxFrameBytes !== undefined) {
      attachOpts.maxFrameBytes = opts.maxFrameBytes
    }
    if (opts.helloTimeoutMs !== undefined) {
      attachOpts.helloTimeoutMs = opts.helloTimeoutMs
    }
    this.boot(attachOpts)
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
    this.attached?.close()
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
    const duplex = createWsDuplex(this.socket)
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
    const attached = attachClient(attach)
    this.attached = attached
    this.settleConnect?.resolve(attached)
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
    const attached = await this.waitConnected(signal)
    return attached.call(path, input, signal)
  }

  private waitConnected(
    signal?: AbortSignal,
  ): Promise<ReturnType<typeof attachClient>> {
    if (signal === undefined) {
      return this.connected
    }
    if (signal.aborted) {
      return Promise.reject(abortedFailure(signal))
    }
    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        signal.removeEventListener('abort', onAbort)
        reject(abortedFailure(signal))
      }
      signal.addEventListener('abort', onAbort)
      this.connected.then(
        (attached) => {
          signal.removeEventListener('abort', onAbort)
          if (signal.aborted) {
            reject(abortedFailure(signal))
            return
          }
          resolve(attached)
        },
        (error) => {
          signal.removeEventListener('abort', onAbort)
          if (signal.aborted) {
            reject(abortedFailure(signal))
            return
          }
          reject(error)
        },
      )
    })
  }
}
