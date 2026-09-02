import { procedure, router } from '@ts-pf/contract'
import { type Duplex, type MessageFrame, MessageSession } from '@ts-pf/message'
import { createImplementer, type ImplementedRouter } from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { PortHandler } from '../src/index.js'

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

function portDuplex(port: MessagePort): Duplex {
  const closeHandlers = new Set<(reason?: unknown) => void>()
  let closed = false

  const close = (reason?: unknown): void => {
    if (closed) {
      return
    }
    closed = true
    try {
      port.close()
    } catch {
      // already disconnected
    }
    for (const handler of [...closeHandlers]) {
      if (reason === undefined) {
        handler()
      } else {
        handler(reason)
      }
    }
  }

  return {
    send(text) {
      if (closed) {
        return
      }
      port.postMessage(text)
    },
    onMessage(handler) {
      const listener = (event: MessageEvent) => {
        if (typeof event.data !== 'string') {
          close()
          return
        }
        handler(event.data)
      }
      port.addEventListener('message', listener)
      return () => {
        port.removeEventListener('message', listener)
      }
    },
    onClose(handler) {
      closeHandlers.add(handler)
      return () => {
        closeHandlers.delete(handler)
      }
    },
    close,
  }
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
  port: MessagePort,
  options: { helloMeta?: unknown } = {},
): { client: MessageSession; frames: MessageFrame[] } {
  const frames: MessageFrame[] = []
  const session: ConstructorParameters<typeof MessageSession>[0] = {
    duplex: portDuplex(port),
    role: 'client',
    onFrame: (frame) => {
      frames.push(frame)
    },
  }
  if (options.helloMeta !== undefined) {
    session.helloMeta = options.helloMeta
  }
  const client = new MessageSession(session)
  port.start()
  return { client, frames }
}

describe('PortHandler', () => {
  it('exports PortHandler and not attachRouter or TransportHandler', async () => {
    const exported = await import('../src/index.js')
    expect(Object.keys(exported).sort()).toEqual(['PortHandler'])
    expect(exported).not.toHaveProperty('attachRouter')
    expect(exported).not.toHaveProperty('TransportHandler')
  })

  it('roundtrips planet.find over a MessageChannel with JSON strings', async () => {
    const { port1, port2 } = new MessageChannel()
    const inbound: unknown[] = []
    port2.addEventListener('message', (event) => {
      inbound.push(event.data)
    })

    const bind = new PortHandler(defaultApp).bind(port1, { context: {} })
    const { client, frames } = openClient(port2)
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

  it('passes port and meta into the context factory, not into the procedure', async () => {
    const { port1, port2 } = new MessageChannel()
    const factoryInfo: unknown[] = []
    let procedureContext: unknown
    const app = planetApp(async ({ input, context }) => {
      procedureContext = context
      return { id: input.id, name: 'Earth' }
    })
    const bind = new PortHandler<{ user: string }>(app).bind(port1, {
      context: (info) => {
        factoryInfo.push(info)
        return { user: 'ada' }
      },
    })
    const { client, frames } = openClient(port2, { helloMeta: { token: 't' } })
    await client.ready

    expect(factoryInfo).toEqual([{ port: port1, meta: { token: 't' } }])

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

  it('closes the session without parsing non-string data', async () => {
    let ran = false
    const app = planetApp(async ({ input }) => {
      ran = true
      return { id: input.id, name: 'Earth' }
    })
    const { port1, port2 } = new MessageChannel()
    const bind = new PortHandler(app).bind(port1, { context: {} })
    const { client, frames } = openClient(port2)
    await client.ready

    port2.postMessage({
      type: 'call',
      id: '1',
      path: ['planet', 'find'],
      input: { id: 1 },
    })
    for (let i = 0; i < 20; i++) {
      await nextTurn()
    }
    expect(ran).toBe(false)
    expect(frames.filter((frame) => frame.type === 'result')).toEqual([])

    bind.close()
    bind.close()
    client.close()
  })

  it('aborts in-flight calls when the peer port closes', async () => {
    let resolveStarted!: () => void
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    let aborted = false
    const app = planetApp(async ({ signal }) => {
      await new Promise<void>((resolve) => {
        const onAbort = () => {
          aborted = true
          resolve()
        }
        if (signal?.aborted) {
          onAbort()
          return
        }
        signal?.addEventListener('abort', onAbort)
        resolveStarted()
      })
      return { id: 1, name: 'late' }
    })
    const { port1, port2 } = new MessageChannel()
    const bind = new PortHandler(app).bind(port1, { context: {} })
    const { client, frames } = openClient(port2)
    await client.ready

    expect(
      client.send({
        type: 'call',
        id: '1',
        path: ['planet', 'find'],
        input: { id: 1 },
      }).ok,
    ).toBe(true)
    await started
    port2.close()

    for (let i = 0; i < 40; i++) {
      await nextTurn()
    }
    expect(aborted).toBe(true)
    expect(
      frames.some(
        (frame) =>
          frame.type === 'result' ||
          frame.type === 'item' ||
          frame.type === 'done',
      ),
    ).toBe(false)
    bind.close()
  })
})
