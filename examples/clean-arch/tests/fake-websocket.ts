import type { WebSocketLike } from '@ts-pf/message-client'

const WS_OPEN = 1
const WS_CLOSING = 2
const WS_CLOSED = 3

type Listener = (ev: { data?: unknown }) => void

export class FakeWebSocket implements WebSocketLike {
  readyState: number
  peer: FakeWebSocket | undefined
  private readonly listeners: Record<
    'message' | 'open' | 'close' | 'error',
    Set<Listener>
  > = {
    message: new Set(),
    open: new Set(),
    close: new Set(),
    error: new Set(),
  }

  constructor(readyState = WS_OPEN) {
    this.readyState = readyState
  }

  send(data: string): void {
    if (this.readyState !== WS_OPEN) {
      throw new Error(`InvalidStateError: readyState ${this.readyState}`)
    }
    const peer = this.peer
    if (!peer) {
      return
    }
    queueMicrotask(() => {
      if (peer.readyState !== WS_OPEN) {
        return
      }
      peer.dispatch('message', { data })
    })
  }

  close(): void {
    if (this.readyState === WS_CLOSING || this.readyState === WS_CLOSED) {
      return
    }
    this.readyState = WS_CLOSING
    const peer = this.peer
    queueMicrotask(() => {
      this.readyState = WS_CLOSED
      this.dispatch('close', {})
      if (
        peer &&
        peer.readyState !== WS_CLOSING &&
        peer.readyState !== WS_CLOSED
      ) {
        peer.readyState = WS_CLOSED
        peer.dispatch('close', {})
      }
    })
  }

  addEventListener(
    type: 'message' | 'open' | 'close' | 'error',
    handler: Listener,
  ): void {
    this.listeners[type].add(handler)
  }

  removeEventListener(
    type: 'message' | 'open' | 'close' | 'error',
    handler: Listener,
  ): void {
    this.listeners[type].delete(handler)
  }

  dispatch(
    type: 'message' | 'open' | 'close' | 'error',
    ev: { data?: unknown },
  ) {
    for (const handler of [...this.listeners[type]]) {
      handler(ev)
    }
  }
}

export function pairedSockets(): {
  client: FakeWebSocket
  server: FakeWebSocket
} {
  const client = new FakeWebSocket()
  const server = new FakeWebSocket()
  client.peer = server
  server.peer = client
  return { client, server }
}
