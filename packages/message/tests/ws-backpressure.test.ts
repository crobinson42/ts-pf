import { describe, expect, it } from 'vitest'
import { createWsDuplex, type WebSocketLike } from '../src/ws.js'

const WS_CONNECTING = 0
const WS_OPEN = 1

type Handler = (ev: { data?: unknown }) => void
type EventType = 'message' | 'open' | 'close' | 'error'

class FakeWebSocket implements WebSocketLike {
  readyState: number
  sent: string[] = []
  private readonly listeners: Record<EventType, Set<Handler>> = {
    message: new Set(),
    open: new Set(),
    close: new Set(),
    error: new Set(),
  }

  constructor(readyState = WS_OPEN) {
    this.readyState = readyState
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
  }

  addEventListener(type: EventType, handler: Handler): void {
    this.listeners[type].add(handler)
  }

  removeEventListener(type: EventType, handler: Handler): void {
    this.listeners[type].delete(handler)
  }

  open(): void {
    this.readyState = WS_OPEN
    for (const handler of [...this.listeners.open]) {
      handler({})
    }
  }
}

/** A socket that reports `bufferedAmount` (grown by `send`) and has `pause` / `resume`. */
class BufferingWebSocket extends FakeWebSocket {
  bufferedAmount = 0
  paused: boolean[] = []

  override send(data: string): void {
    super.send(data)
    this.bufferedAmount += data.length
  }

  pause(): void {
    this.paused.push(true)
  }

  resume(): void {
    this.paused.push(false)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitUntil(pred: () => boolean): Promise<void> {
  const started = Date.now()
  while (!pred()) {
    if (Date.now() - started > 2000) {
      throw new Error('timed out waiting for condition')
    }
    await sleep(2)
  }
}

describe('createWsDuplex backpressure', () => {
  it('send is synchronous while bufferedAmount is under the mark', () => {
    const socket = new BufferingWebSocket(WS_OPEN)
    const duplex = createWsDuplex(socket, { highWaterMark: 100 })
    expect(duplex.send('x'.repeat(50))).toBeUndefined()
    duplex.close()
  })

  it('returns a drain promise above the mark that resolves once bufferedAmount drops', async () => {
    const socket = new BufferingWebSocket(WS_OPEN)
    const duplex = createWsDuplex(socket, { highWaterMark: 100 })
    const drained = duplex.send('x'.repeat(150))
    expect(drained).toBeInstanceOf(Promise)
    let settled = false
    void drained?.then(() => {
      settled = true
    })
    await sleep(30)
    expect(settled).toBe(false)

    socket.bufferedAmount = 0
    await waitUntil(() => settled)
    duplex.close()
  })

  it('a socket without bufferedAmount never returns a drain promise', () => {
    const socket = new FakeWebSocket(WS_OPEN)
    const duplex = createWsDuplex(socket, { highWaterMark: 1 })
    expect(duplex.send('x'.repeat(1000))).toBeUndefined()
    duplex.close()
  })

  it('caps the CONNECTING queue by the mark and resolves on open', async () => {
    const socket = new BufferingWebSocket(WS_CONNECTING)
    const duplex = createWsDuplex(socket, { highWaterMark: 10 })
    expect(duplex.send('short')).toBeUndefined()
    const drained = duplex.send('much longer')
    expect(drained).toBeInstanceOf(Promise)
    let settled = false
    void drained?.then(() => {
      settled = true
    })
    await sleep(5)
    expect(settled).toBe(false)

    // the flush on open is what resolves it; keep bufferedAmount under the mark
    socket.open()
    socket.bufferedAmount = 0
    await waitUntil(() => settled)
    expect(socket.sent).toEqual(['short', 'much longer'])
    duplex.close()
  })

  it('a pending drain promise resolves on close', async () => {
    const socket = new BufferingWebSocket(WS_OPEN)
    const duplex = createWsDuplex(socket, { highWaterMark: 1 })
    const drained = duplex.send('xx')
    let settled = false
    void drained?.then(() => {
      settled = true
    })
    duplex.close()
    await waitUntil(() => settled)
  })

  it('forwards pause / resume only when the socket has them', () => {
    const plain = createWsDuplex(new FakeWebSocket(WS_OPEN))
    expect(plain.pause).toBeUndefined()
    expect(plain.resume).toBeUndefined()

    const socket = new BufferingWebSocket(WS_OPEN)
    const duplex = createWsDuplex(socket)
    duplex.pause?.()
    duplex.resume?.()
    expect(socket.paused).toEqual([true, false])
    plain.close()
    duplex.close()
  })
})
