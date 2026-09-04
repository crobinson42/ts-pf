import { describe, expect, it } from 'vitest'
import { createWsDuplex, type WebSocketLike } from '../src/ws.js'

const WS_CONNECTING = 0
const WS_OPEN = 1
const WS_CLOSING = 2
const WS_CLOSED = 3

type Handler = (ev: { data?: unknown }) => void

class FakeWebSocket implements WebSocketLike {
  readyState: number
  sent: string[] = []
  closeCalls: { code?: number }[] = []
  private readonly listeners: Record<
    'message' | 'open' | 'close' | 'error',
    Set<Handler>
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
    this.sent.push(data)
  }

  close(code?: number): void {
    if (this.readyState === WS_CLOSING || this.readyState === WS_CLOSED) {
      return
    }
    this.closeCalls.push(code === undefined ? {} : { code })
    this.readyState = WS_CLOSED
    this.dispatch('close', {})
  }

  addEventListener(
    type: 'message' | 'open' | 'close' | 'error',
    handler: Handler,
  ): void {
    this.listeners[type].add(handler)
  }

  removeEventListener(
    type: 'message' | 'open' | 'close' | 'error',
    handler: Handler,
  ): void {
    this.listeners[type].delete(handler)
  }

  dispatch(
    type: 'message' | 'open' | 'close' | 'error',
    ev: { data?: unknown },
  ): void {
    for (const handler of [...this.listeners[type]]) {
      handler(ev)
    }
  }

  open(): void {
    this.readyState = WS_OPEN
    this.dispatch('open', {})
  }
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve)
  })
}

describe('createWsDuplex', () => {
  it('queues send while CONNECTING and flushes on open', () => {
    const socket = new FakeWebSocket(WS_CONNECTING)
    const duplex = createWsDuplex(socket)
    duplex.send('hello')
    duplex.send('again')
    expect(socket.sent).toEqual([])

    socket.open()
    expect(socket.sent).toEqual(['hello', 'again'])
    duplex.close()
  })

  it('closes with 1002 on a non-string message', async () => {
    const socket = new FakeWebSocket(WS_OPEN)
    const duplex = createWsDuplex(socket)
    let closed = false
    duplex.onClose(() => {
      closed = true
    })
    duplex.onMessage(() => {
      throw new Error('must not parse binary')
    })

    socket.dispatch('message', { data: new ArrayBuffer(8) })
    await nextTurn()
    expect(closed).toBe(true)
    expect(socket.closeCalls).toEqual([{ code: 1002 }])
  })

  it('fires onClose on the next turn when already closed', async () => {
    const socket = new FakeWebSocket(WS_CLOSED)
    const duplex = createWsDuplex(socket)
    let closed = false
    duplex.onClose(() => {
      closed = true
    })
    expect(closed).toBe(false)
    await nextTurn()
    expect(closed).toBe(true)
  })
})
