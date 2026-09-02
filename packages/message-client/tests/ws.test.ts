import type { Link } from '@ts-pf/client'
import { createClient, isLocalFailure } from '@ts-pf/client'
import { procedure, router } from '@ts-pf/contract'
import { WsHandler } from '@ts-pf/message-server'
import { createImplementer } from '@ts-pf/server'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { WsLink } from '../src/index.js'
import type { WebSocketLike } from '../src/ws.js'

const WS_CONNECTING = 0
const WS_OPEN = 1
const WS_CLOSING = 2
const WS_CLOSED = 3

type WsHandlerFn = (ev: { data?: unknown }) => void

class FakeWebSocket implements WebSocketLike {
  readyState: number
  url: string | undefined
  sent: string[] = []
  closeCalls: { code?: number }[] = []
  peer: FakeWebSocket | undefined
  private readonly listeners: Record<
    'message' | 'open' | 'close' | 'error',
    Set<WsHandlerFn>
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

  close(code?: number): void {
    if (this.readyState === WS_CLOSING || this.readyState === WS_CLOSED) {
      return
    }
    this.closeCalls.push(code === undefined ? {} : { code })
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
    handler: WsHandlerFn,
  ): void {
    this.listeners[type].add(handler)
  }

  removeEventListener(
    type: 'message' | 'open' | 'close' | 'error',
    handler: WsHandlerFn,
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

  open(): void {
    this.readyState = WS_OPEN
    this.dispatch('open', {})
  }

  error(): void {
    this.dispatch('error', {})
  }
}

function paired(readyState = WS_OPEN): {
  client: FakeWebSocket
  server: FakeWebSocket
} {
  const client = new FakeWebSocket(readyState)
  const server = new FakeWebSocket(readyState)
  client.peer = server
  server.peer = client
  return { client, server }
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
  },
})

const impl = createImplementer(contract)
const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input }) => ({
      id: input.id,
      name: 'Earth',
    })),
  },
})

describe('WsLink', () => {
  it('exports WsLink from the package index and not attachClient or StdioLink', async () => {
    const exported = await import('../src/index.js')
    expect(exported).toHaveProperty('WsLink')
    expect(exported).not.toHaveProperty('attachClient')
    expect(exported).not.toHaveProperty('StdioLink')
    expect(exported).not.toHaveProperty('RPCLink')
  })

  it('implements Link without widening it with close', () => {
    expectTypeOf<WsLink>().toMatchTypeOf<Link>()
    expectTypeOf<Link>().not.toHaveProperty('close')
    expectTypeOf<WsLink['close']>().toBeFunction()
  })

  it('throws TypeError when neither socket nor url is provided', () => {
    expect(() => new WsLink({} as never)).toThrowError(
      new TypeError('WsLink requires exactly one of socket or url'),
    )
  })

  it('throws TypeError when both socket and url are provided', () => {
    expect(
      () =>
        new WsLink({
          socket: new FakeWebSocket(),
          url: 'ws://example.test',
        } as never),
    ).toThrowError(
      new TypeError('WsLink requires exactly one of socket or url'),
    )
  })

  it('throws TypeError when url is set without a WebSocket constructor', () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket')
    const deleted = Reflect.deleteProperty(globalThis, 'WebSocket')
    expect(deleted).toBe(true)
    try {
      expect(() => new WsLink({ url: 'ws://example.test' })).toThrowError(
        new TypeError('WsLink url requires WebSocket'),
      )
    } finally {
      if (desc !== undefined) {
        Object.defineProperty(globalThis, 'WebSocket', desc)
      }
    }
  })

  it('sends hello immediately when the socket is OPEN', () => {
    const socket = new FakeWebSocket(WS_OPEN)
    const link = new WsLink({ socket })
    expect(socket.sent).toEqual(['{"type":"hello","v":1}'])
    link.close()
  })

  it('waits for open before hello when the socket is CONNECTING', () => {
    const socket = new FakeWebSocket(WS_CONNECTING)
    const link = new WsLink({ socket })
    expect(socket.sent).toEqual([])
    socket.open()
    expect(socket.sent).toEqual(['{"type":"hello","v":1}'])
    link.close()
  })

  it.each([WS_CLOSING, WS_CLOSED])(
    'constructs when readyState is %s and ready rejects Connection closed',
    async (readyState) => {
      const socket = new FakeWebSocket(readyState)
      const link = new WsLink({ socket, helloTimeoutMs: 0 })
      const error = await link.call(['planet', 'find'], { id: 1 }).then(
        () => {
          throw new Error('should reject')
        },
        (reason: unknown) => reason,
      )
      expect(isLocalFailure(error)).toBe(true)
      expect(error).toMatchObject({
        code: 'INTERNAL',
        status: 0,
        message: 'Connection closed',
      })
      expect(socket.sent).toEqual([])
      link.close()
    },
  )

  it('url uses the injected WebSocket and hellos after open', () => {
    const created: FakeWebSocket[] = []
    class Injected extends FakeWebSocket {
      constructor(url: string) {
        super(WS_CONNECTING)
        this.url = url
        created.push(this)
      }
    }
    const link = new WsLink({
      url: 'ws://example.test/rpc',
      WebSocket: Injected,
    })
    expect(created).toHaveLength(1)
    expect(created[0]?.url).toBe('ws://example.test/rpc')
    expect(created[0]?.sent).toEqual([])
    created[0]?.open()
    expect(created[0]?.sent).toEqual(['{"type":"hello","v":1}'])
    link.close()
  })

  it('connect error before open rejects ready with Network error', async () => {
    const socket = new FakeWebSocket(WS_CONNECTING)
    const link = new WsLink({ socket, helloTimeoutMs: 0 })
    socket.error()
    const error = await link.call(['planet', 'find'], { id: 1 }).then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isLocalFailure(error)).toBe(true)
    expect(error).toMatchObject({
      code: 'INTERNAL',
      status: 0,
      message: 'Network error',
    })
    const later = await link.call(['planet', 'find'], { id: 2 }).then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    expect(later).toMatchObject({ message: 'Network error' })
    link.close()
  })

  it('abort while CONNECTING is Request aborted and does not close the socket', async () => {
    const socket = new FakeWebSocket(WS_CONNECTING)
    const link = new WsLink({ socket, helloTimeoutMs: 0 })
    const ac = new AbortController()
    const pending = link.call(['planet', 'find'], { id: 1 }, ac.signal)
    ac.abort()
    const error = await pending.then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isLocalFailure(error)).toBe(true)
    expect(error).toMatchObject({ message: 'Request aborted' })
    expect(socket.readyState).toBe(WS_CONNECTING)
    expect(socket.closeCalls).toEqual([])

    socket.open()
    expect(socket.sent).toEqual(['{"type":"hello","v":1}'])
    link.close()
  })

  it('clean close uses code 1000 and is idempotent', () => {
    const socket = new FakeWebSocket(WS_OPEN)
    const link = new WsLink({ socket })
    link.close()
    link.close()
    expect(socket.closeCalls).toEqual([{ code: 1000 }])
  })

  it('roundtrips planet.find over WsHandler + WsLink fake sockets', async () => {
    const { client: clientSocket, server: serverSocket } = paired()
    const bind = new WsHandler(app).bind(serverSocket, { context: {} })
    const link = new WsLink({ socket: clientSocket })
    const client = createClient<typeof contract>(link)

    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })

    link.close()
    bind.close()
  })

  it('closes with 1002 when the peer sends a binary frame', async () => {
    const { client: clientSocket, server: serverSocket } = paired()
    const bind = new WsHandler(app).bind(serverSocket, { context: {} })
    const link = new WsLink({ socket: clientSocket })
    await createClient<typeof contract>(link).planet.find({ id: 1 })

    clientSocket.dispatch('message', { data: new ArrayBuffer(8) })
    for (let i = 0; i < 10; i++) {
      await nextTurn()
    }
    expect(clientSocket.closeCalls).toEqual([{ code: 1002 }])

    bind.close()
    link.close()
  })
})
