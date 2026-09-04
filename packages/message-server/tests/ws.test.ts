import { procedure, router } from '@ts-pf/contract'
import {
  createWsDuplex,
  type MessageFrame,
  MessageSession,
} from '@ts-pf/message'
import { createImplementer, type ImplementedRouter } from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { WsHandler } from '../src/index.js'
import type { WebSocketLike } from '../src/ws.js'

const WS_OPEN = 1
const WS_CLOSING = 2
const WS_CLOSED = 3

type WsHandlerFn = (ev: { data?: unknown }) => void

class FakeWebSocket implements WebSocketLike {
  readyState: number
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

async function waitFor(
  frames: MessageFrame[],
  pred: (frame: MessageFrame) => boolean,
): Promise<MessageFrame> {
  for (let i = 0; i < 80; i++) {
    const found = frames.find(pred)
    if (found) {
      return found
    }
    await nextTurn()
  }
  throw new Error(`timed out waiting for frame: ${JSON.stringify(frames)}`)
}

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
  },
})

const impl = createImplementer(contract)

function planetApp(
  find: Parameters<typeof impl.planet.find.handler>[0],
): ImplementedRouter {
  return impl.router({
    planet: {
      find: impl.planet.find.handler(find),
    },
  })
}

const defaultApp = planetApp(async ({ input }) => ({
  id: input.id,
  name: 'Earth',
}))

function openClient(
  socket: FakeWebSocket,
  options: { helloMeta?: unknown } = {},
): { client: MessageSession; frames: MessageFrame[] } {
  const frames: MessageFrame[] = []
  const session: ConstructorParameters<typeof MessageSession>[0] = {
    duplex: createWsDuplex(socket),
    role: 'client',
    onFrame: (frame) => {
      frames.push(frame)
    },
  }
  if (options.helloMeta !== undefined) {
    session.helloMeta = options.helloMeta
  }
  const client = new MessageSession(session)
  return { client, frames }
}

describe('WsHandler', () => {
  it('exports WsHandler from the package index', async () => {
    const exported = await import('../src/index.js')
    expect(exported).toHaveProperty('WsHandler')
    expect(exported).not.toHaveProperty('attachRouter')
    expect(exported).not.toHaveProperty('StdioHandler')
  })

  it('roundtrips planet.find over paired fake sockets with JSON strings', async () => {
    const { client: clientSocket, server: serverSocket } = paired()
    const inbound: unknown[] = []
    clientSocket.addEventListener('message', (event) => {
      inbound.push(event.data)
    })

    const bind = new WsHandler(defaultApp).bind(serverSocket, { context: {} })
    const { client, frames } = openClient(clientSocket)
    await client.ready

    expect(
      client.send({
        type: 'call',
        id: '1',
        path: ['planet', 'find'],
        input: { id: 1 },
      }).ok,
    ).toBe(true)

    const result = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(result).toEqual({
      type: 'result',
      id: '1',
      ok: true,
      output: { id: 1, name: 'Earth' },
    })
    expect(inbound.length).toBeGreaterThan(0)
    expect(inbound.every((data) => typeof data === 'string')).toBe(true)

    bind.close()
    bind.close()
    client.close()
  })

  it('passes socket and meta into the context factory, not into the procedure', async () => {
    const { client: clientSocket, server: serverSocket } = paired()
    const factoryInfo: unknown[] = []
    let procedureContext: unknown
    const app = planetApp(async ({ input, context }) => {
      procedureContext = context
      return { id: input.id, name: 'Earth' }
    })
    const bind = new WsHandler<{ user: string }>(app).bind(serverSocket, {
      context: (info) => {
        factoryInfo.push(info)
        return { user: 'ada' }
      },
    })
    const { client, frames } = openClient(clientSocket, {
      helloMeta: { token: 't' },
    })
    await client.ready

    expect(factoryInfo).toEqual([
      { socket: serverSocket, meta: { token: 't' } },
    ])

    expect(
      client.send({
        type: 'call',
        id: '1',
        path: ['planet', 'find'],
        input: { id: 1 },
      }).ok,
    ).toBe(true)
    await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(procedureContext).toEqual({ user: 'ada' })

    bind.close()
    client.close()
  })

  it('closes with 1002 and does not parse binary messages', async () => {
    let ran = false
    const app = planetApp(async ({ input }) => {
      ran = true
      return { id: input.id, name: 'Earth' }
    })
    const { client: clientSocket, server: serverSocket } = paired()
    const bind = new WsHandler(app).bind(serverSocket, { context: {} })
    const { client, frames } = openClient(clientSocket)
    await client.ready

    serverSocket.dispatch('message', { data: new Uint8Array([1, 2, 3]) })
    for (let i = 0; i < 20; i++) {
      await nextTurn()
    }
    expect(ran).toBe(false)
    expect(frames.filter((frame) => frame.type === 'result')).toEqual([])
    expect(serverSocket.closeCalls).toEqual([{ code: 1002 }])

    bind.close()
    client.close()
  })

  it('closes with 1002 on non-string object messages', async () => {
    const { server: serverSocket } = paired()
    const bind = new WsHandler(defaultApp).bind(serverSocket, { context: {} })
    serverSocket.dispatch('message', {
      data: { type: 'hello', v: 1 },
    })
    for (let i = 0; i < 10; i++) {
      await nextTurn()
    }
    expect(serverSocket.closeCalls).toEqual([{ code: 1002 }])
    bind.close()
  })

  it('clean bind.close uses code 1000 and is idempotent', async () => {
    const { server: serverSocket } = paired()
    const bind = new WsHandler(defaultApp).bind(serverSocket, { context: {} })
    bind.close()
    bind.close()
    expect(serverSocket.closeCalls).toEqual([{ code: 1000 }])
  })
})
