import { procedure, router } from '@ts-pf/contract'
import {
  createMemoryDuplex,
  decodeFrame,
  encodeFrame,
  frameByteLength,
  type MessageFrame,
  MessageSession,
} from '@ts-pf/message'
import { createImplementer, type ImplementedRouter } from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { HandlerOptions } from '../src/index.js'
import { attachRouter } from '../src/shared.js'

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve)
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
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
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

function openPair(
  app: ImplementedRouter,
  options: HandlerOptions & {
    context?:
      | unknown
      | ((info: { meta?: unknown }) => unknown | Promise<unknown>)
  } = {},
) {
  const { a, b } = createMemoryDuplex()
  const frames: MessageFrame[] = []
  const attach: Parameters<typeof attachRouter>[0] = {
    duplex: a,
    router: app,
    context: options.context ?? {},
  }
  if (options.maxFrameBytes !== undefined) {
    attach.maxFrameBytes = options.maxFrameBytes
  }
  if (options.helloTimeoutMs !== undefined) {
    attach.helloTimeoutMs = options.helloTimeoutMs
  }
  if (options.onError !== undefined) {
    attach.onError = options.onError
  }
  if (options.interceptors !== undefined) {
    attach.interceptors = options.interceptors
  }
  const server = attachRouter(attach)
  const client = new MessageSession({
    duplex: b,
    role: 'client',
    onFrame: (frame) => {
      frames.push(frame)
    },
  })
  return { client, frames, server }
}

describe('shared unary dispatch', () => {
  it('known path returns result ok true with output', async () => {
    const { client, frames, server } = openPair(defaultApp)
    await Promise.all([server.ready, client.ready])

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
    server.close()
  })

  it('runs call interceptors in onion order on a successful call', async () => {
    const order: string[] = []
    const app = planetApp(async ({ input }) => {
      order.push('handler')
      return { id: input.id, name: 'Earth' }
    })
    const { client, frames, server } = openPair(app, {
      interceptors: [
        async ({ next }) => {
          order.push('in-0')
          const result = await next()
          order.push('out-0')
          return result
        },
        async ({ next }) => {
          order.push('in-1')
          const result = await next()
          order.push('out-1')
          return result
        },
      ],
    })
    await Promise.all([server.ready, client.ready])

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
    expect(order).toEqual(['in-0', 'in-1', 'handler', 'out-1', 'out-0'])
    server.close()
  })

  it('does not run call interceptors on lookup NOT_FOUND', async () => {
    let interceptorRan = false
    const { client, frames, server } = openPair(defaultApp, {
      interceptors: [
        async ({ next }) => {
          interceptorRan = true
          return next()
        },
      ],
    })
    await Promise.all([server.ready, client.ready])

    expect(
      client.send({
        type: 'call',
        id: '1',
        path: ['planet', 'missing'],
      }).ok,
    ).toBe(true)

    const result = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(result).toEqual({
      type: 'result',
      id: '1',
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Procedure not found' },
    })
    expect(interceptorRan).toBe(false)
    server.close()
  })

  it('unknown path returns NOT_FOUND', async () => {
    const { client, frames, server } = openPair(defaultApp)
    await Promise.all([server.ready, client.ready])

    expect(
      client.send({
        type: 'call',
        id: '1',
        path: ['planet', 'missing'],
      }).ok,
    ).toBe(true)

    const result = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(result).toEqual({
      type: 'result',
      id: '1',
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Procedure not found' },
    })
    server.close()
  })

  it('thrown PFError is sent as a result envelope via toJSON', async () => {
    const app = planetApp(async ({ errors }) => {
      throw errors.NOT_FOUND({ id: 7 })
    })
    const { client, frames, server } = openPair(app)
    await Promise.all([server.ready, client.ready])

    expect(
      client.send({
        type: 'call',
        id: '1',
        path: ['planet', 'find'],
        input: { id: 7 },
      }).ok,
    ).toBe(true)

    const result = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(result).toEqual({
      type: 'result',
      id: '1',
      ok: false,
      error: { code: 'NOT_FOUND', message: 'NOT_FOUND', data: { id: 7 } },
    })
    server.close()
  })

  it('unknown throw sends INTERNAL and calls onError', async () => {
    const boom = new Error('secret boom')
    const seen: unknown[] = []
    const app = planetApp(async () => {
      throw boom
    })
    const { client, frames, server } = openPair(app, {
      onError: (error) => {
        seen.push(error)
      },
    })
    await Promise.all([server.ready, client.ready])

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
      ok: false,
      error: { code: 'INTERNAL', message: 'Internal server error' },
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(seen).toEqual([boom])
    server.close()
  })

  it('parallel ids complete independently without onFrame awaiting runProcedure', async () => {
    const started: number[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const app = planetApp(async ({ input }) => {
      started.push(input.id)
      await gate
      return { id: input.id, name: 'Earth' }
    })
    const { client, frames, server } = openPair(app)
    await Promise.all([server.ready, client.ready])

    expect(
      client.send({
        type: 'call',
        id: '1',
        path: ['planet', 'find'],
        input: { id: 1 },
      }).ok,
    ).toBe(true)
    expect(
      client.send({
        type: 'call',
        id: '2',
        path: ['planet', 'find'],
        input: { id: 2 },
      }).ok,
    ).toBe(true)

    for (let i = 0; i < 80 && started.length < 2; i++) {
      await nextTurn()
    }
    expect(started).toEqual([1, 2])
    expect(frames.filter((frame) => frame.type === 'result')).toEqual([])

    release()
    const first = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    const second = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '2',
    )
    expect(first).toEqual({
      type: 'result',
      id: '1',
      ok: true,
      output: { id: 1, name: 'Earth' },
    })
    expect(second).toEqual({
      type: 'result',
      id: '2',
      ok: true,
      output: { id: 2, name: 'Earth' },
    })
    server.close()
  })

  it('duplicate in-flight id is ignored; first call still completes', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = 0
    const app = planetApp(async ({ input }) => {
      started += 1
      await gate
      return { id: input.id, name: 'Earth' }
    })
    const { client, frames, server } = openPair(app)
    await Promise.all([server.ready, client.ready])

    expect(
      client.send({
        type: 'call',
        id: '1',
        path: ['planet', 'find'],
        input: { id: 1 },
      }).ok,
    ).toBe(true)
    for (let i = 0; i < 80 && started < 1; i++) {
      await nextTurn()
    }
    expect(started).toBe(1)

    expect(
      client.send({
        type: 'call',
        id: '1',
        path: ['planet', 'find'],
        input: { id: 99 },
      }).ok,
    ).toBe(true)
    for (let i = 0; i < 20; i++) {
      await nextTurn()
    }
    expect(started).toBe(1)

    release()
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
    expect(frames.filter((frame) => frame.type === 'result')).toHaveLength(1)
    expect(
      frames.some(
        (frame) =>
          frame.type === 'result' &&
          !frame.ok &&
          frame.error.code === 'BAD_REQUEST',
      ),
    ).toBe(false)
    server.close()
  })

  it('malformed unused-id frame after ready is BAD_REQUEST; later calls still work', async () => {
    const { client, frames, server } = openPair(defaultApp)
    await Promise.all([server.ready, client.ready])

    expect(
      client.sendText(
        '{"type":"call","id":"9","path":["planet","find"],"nope":true}',
      ).ok,
    ).toBe(true)

    const invalid = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '9',
    )
    expect(invalid).toEqual({
      type: 'result',
      id: '9',
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'Unexpected key nope' },
    })

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
    server.close()
  })

  it('malformed in-flight id is ignored; first call still completes', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = 0
    const app = planetApp(async ({ input }) => {
      started += 1
      await gate
      return { id: input.id, name: 'Earth' }
    })
    const { client, frames, server } = openPair(app)
    await Promise.all([server.ready, client.ready])

    expect(
      client.send({
        type: 'call',
        id: '1',
        path: ['planet', 'find'],
        input: { id: 1 },
      }).ok,
    ).toBe(true)
    for (let i = 0; i < 80 && started < 1; i++) {
      await nextTurn()
    }
    expect(started).toBe(1)

    expect(
      client.sendText(
        '{"type":"call","id":"1","path":["planet","find"],"nope":true}',
      ).ok,
    ).toBe(true)
    for (let i = 0; i < 20; i++) {
      await nextTurn()
    }
    expect(frames.filter((frame) => frame.type === 'result')).toEqual([])

    release()
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
    expect(frames.filter((frame) => frame.type === 'result')).toHaveLength(1)
    server.close()
  })

  it('cancel aborts the handler signal and sends no terminal frame', async () => {
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
    const { client, frames, server } = openPair(app)
    await Promise.all([server.ready, client.ready])

    expect(
      client.send({
        type: 'call',
        id: '1',
        path: ['planet', 'find'],
        input: { id: 1 },
      }).ok,
    ).toBe(true)
    await started
    expect(client.send({ type: 'cancel', id: '1' }).ok).toBe(true)

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
    server.close()
  })

  it('async generator output emits item then done', async () => {
    const chatContract = router({
      chat: procedure,
    })
    const chatImpl = createImplementer(chatContract)
    const app = chatImpl.router({
      chat: chatImpl.chat.handler(async function* () {
        yield { token: 'hi' }
        yield { token: 'there' }
      }),
    })
    const { client, frames, server } = openPair(app)
    await Promise.all([server.ready, client.ready])

    expect(
      client.send({
        type: 'call',
        id: '1',
        path: ['chat'],
      }).ok,
    ).toBe(true)

    const done = await waitFor(
      frames,
      (frame) => frame.type === 'done' && frame.id === '1',
    )
    expect(done).toEqual({ type: 'done', id: '1' })
    expect(frames.filter((frame) => frame.type === 'item')).toEqual([
      { type: 'item', id: '1', output: { token: 'hi' } },
      { type: 'item', id: '1', output: { token: 'there' } },
    ])
    expect(frames.some((frame) => frame.type === 'result')).toBe(false)
    server.close()
  })

  it('cancel during a stream calls iterator.return and sends no late frames', async () => {
    const boom = new Error('return failed')
    const seen: unknown[] = []
    let hanging!: Promise<void>
    const chatContract = router({
      chat: procedure,
    })
    const chatImpl = createImplementer(chatContract)
    const app = chatImpl.router({
      chat: chatImpl.chat.handler(async () => ({
        [Symbol.asyncIterator]() {
          let first = true
          return {
            async next() {
              if (first) {
                first = false
                return { done: false, value: { token: 'hi' } }
              }
              hanging = new Promise(() => {})
              await hanging
              return { done: true as const, value: undefined }
            },
            async return() {
              throw boom
            },
          }
        },
      })),
    })
    const { client, frames, server } = openPair(app, {
      onError: (error) => {
        seen.push(error)
      },
    })
    await Promise.all([server.ready, client.ready])

    expect(
      client.send({
        type: 'call',
        id: '1',
        path: ['chat'],
      }).ok,
    ).toBe(true)
    await waitFor(
      frames,
      (frame) =>
        frame.type === 'item' &&
        frame.id === '1' &&
        (frame.output as { token: string }).token === 'hi',
    )
    expect(client.send({ type: 'cancel', id: '1' }).ok).toBe(true)
    for (let i = 0; i < 40; i++) {
      await nextTurn()
    }
    expect(seen).toEqual([boom])
    expect(
      frames.some((frame) => frame.type === 'done' || frame.type === 'result'),
    ).toBe(false)
    server.close()
  })

  it('oversize encoded result becomes PAYLOAD_TOO_LARGE', async () => {
    const output = { id: 1, name: 'X'.repeat(200) }
    const app = planetApp(async () => output)
    const okFrame = {
      type: 'result' as const,
      id: '1',
      ok: true as const,
      output,
    }
    const errFrame = {
      type: 'result' as const,
      id: '1',
      ok: false as const,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Frame too large' },
    }
    const maxFrameBytes = frameByteLength(errFrame) + 16
    expect(frameByteLength(okFrame)).toBeGreaterThan(maxFrameBytes)
    expect(frameByteLength(errFrame)).toBeLessThanOrEqual(maxFrameBytes)

    const { client, frames, server } = openPair(app, { maxFrameBytes })
    await Promise.all([server.ready, client.ready])

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
      ok: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Frame too large' },
    })
    server.close()
  })

  it('context factory runs as onHello before hello-ok', async () => {
    const { a, b } = createMemoryDuplex()
    const order: string[] = []
    const server = attachRouter({
      duplex: a,
      router: defaultApp,
      context: () => {
        order.push('factory')
        return {}
      },
    })
    b.onMessage((text) => {
      const decoded = decodeFrame(text)
      if (decoded.ok && decoded.frame.type === 'hello-ok') {
        order.push('hello-ok')
      }
    })
    const client = new MessageSession({
      duplex: b,
      role: 'client',
      onFrame: () => {},
    })
    await Promise.all([server.ready, client.ready])
    expect(order).toEqual(['factory', 'hello-ok'])
    server.close()
  })

  it('context factory throw sends hello-error INTERNAL and calls onError', async () => {
    const { a, b } = createMemoryDuplex()
    const seen: unknown[] = []
    const received: string[] = []
    b.onMessage((text) => {
      received.push(text)
    })
    const server = attachRouter({
      duplex: a,
      router: defaultApp,
      context: () => {
        throw new Error('secret factory')
      },
      onError: (error) => {
        seen.push(error)
      },
    })
    const client = new MessageSession({
      duplex: b,
      role: 'client',
      onFrame: () => {},
    })
    const reason = await client.ready.then(
      () => {
        throw new Error('client ready should reject')
      },
      (error: unknown) => error,
    )
    expect(reason).toMatchObject({
      code: 'INTERNAL',
      message: 'Internal server error',
    })
    expect(JSON.stringify(reason)).not.toContain('secret')
    expect(seen).toHaveLength(1)
    expect(seen[0]).toBeInstanceOf(Error)
    expect((seen[0] as Error).message).toBe('secret factory')
    expect(received).toEqual([
      encodeFrame({
        type: 'hello-error',
        error: { code: 'INTERNAL', message: 'Internal server error' },
      }),
    ])
    await expect(server.ready).rejects.toMatchObject({ code: 'INTERNAL' })
  })

  it('call.stream true runs with an input queue and keeps the first in-item', async () => {
    const ingestContract = router({
      ingest: procedure.output(z.object({ count: z.number() })),
    })
    const ingestImpl = createImplementer(ingestContract)
    let ran = false
    const app = ingestImpl.router({
      ingest: ingestImpl.ingest.handler(async ({ input }) => {
        ran = true
        let count = 0
        for await (const item of input as unknown as AsyncIterable<{
          chunk: number
        }>) {
          count += item.chunk
        }
        return { count }
      }),
    })
    const { client, frames, server } = openPair(app)
    await Promise.all([server.ready, client.ready])

    expect(
      client.send({
        type: 'call',
        id: '1',
        path: ['ingest'],
        stream: true,
      }).ok,
    ).toBe(true)
    expect(
      client.send({
        type: 'in-item',
        id: '1',
        input: { chunk: 1 },
      }).ok,
    ).toBe(true)
    expect(
      client.send({
        type: 'in-item',
        id: '1',
        input: { chunk: 2 },
      }).ok,
    ).toBe(true)
    expect(client.send({ type: 'in-done', id: '1' }).ok).toBe(true)

    const result = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(ran).toBe(true)
    expect(result).toEqual({
      type: 'result',
      id: '1',
      ok: true,
      output: { count: 3 },
    })
    server.close()
  })
})

describe('shared stream dispatch', () => {
  it('emits done with zero items for an empty generator', async () => {
    const chatContract = router({
      chat: procedure,
    })
    const chatImpl = createImplementer(chatContract)
    const app = chatImpl.router({
      chat: chatImpl.chat.handler(async function* () {}),
    })
    const { client, frames, server } = openPair(app)
    await Promise.all([server.ready, client.ready])

    expect(client.send({ type: 'call', id: '1', path: ['chat'] }).ok).toBe(true)
    const done = await waitFor(
      frames,
      (frame) => frame.type === 'done' && frame.id === '1',
    )
    expect(done).toEqual({ type: 'done', id: '1' })
    expect(frames.filter((frame) => frame.type === 'item')).toEqual([])
    server.close()
  })

  it('sends result error and no done on a mid-stream PFError', async () => {
    const chatContract = router({
      chat: procedure.errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
    })
    const chatImpl = createImplementer(chatContract)
    const app = chatImpl.router({
      chat: chatImpl.chat.handler(async function* ({ errors }) {
        yield { token: 'a' }
        throw errors.NOT_FOUND({ id: 1 })
      }),
    })
    const { client, frames, server } = openPair(app)
    await Promise.all([server.ready, client.ready])

    expect(client.send({ type: 'call', id: '1', path: ['chat'] }).ok).toBe(true)
    const result = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(frames.filter((frame) => frame.type === 'item')).toEqual([
      { type: 'item', id: '1', output: { token: 'a' } },
    ])
    expect(result).toEqual({
      type: 'result',
      id: '1',
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'NOT_FOUND',
        data: { id: 1 },
      },
    })
    expect(frames.some((frame) => frame.type === 'done')).toBe(false)
    server.close()
  })

  it('sends INTERNAL and calls onError on a mid-stream unknown throw', async () => {
    const boom = new Error('secret boom')
    const seen: unknown[] = []
    const chatContract = router({
      chat: procedure,
    })
    const chatImpl = createImplementer(chatContract)
    const app = chatImpl.router({
      chat: chatImpl.chat.handler(async function* () {
        yield { token: 'a' }
        throw boom
      }),
    })
    const { client, frames, server } = openPair(app, {
      onError: (error) => {
        seen.push(error)
      },
    })
    await Promise.all([server.ready, client.ready])

    expect(client.send({ type: 'call', id: '1', path: ['chat'] }).ok).toBe(true)
    const result = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(result).toEqual({
      type: 'result',
      id: '1',
      ok: false,
      error: { code: 'INTERNAL', message: 'Internal server error' },
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(frames.some((frame) => frame.type === 'done')).toBe(false)
    expect(seen).toEqual([boom])
    server.close()
  })

  it('rejects a nested stream item with BAD_REQUEST and no done', async () => {
    const chatContract = router({
      chat: procedure,
    })
    const chatImpl = createImplementer(chatContract)
    const app = chatImpl.router({
      chat: chatImpl.chat.handler(async function* () {
        async function* inner() {
          yield 1
        }
        yield inner()
      }),
    })
    const { client, frames, server } = openPair(app)
    await Promise.all([server.ready, client.ready])

    expect(client.send({ type: 'call', id: '1', path: ['chat'] }).ok).toBe(true)
    const result = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(result).toEqual({
      type: 'result',
      id: '1',
      ok: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Nested streams are not supported',
      },
    })
    expect(frames.some((frame) => frame.type === 'done')).toBe(false)
    expect(frames.some((frame) => frame.type === 'item')).toBe(false)
    server.close()
  })

  it('rejects a Blob item with BAD_REQUEST', async () => {
    const chatContract = router({
      chat: procedure,
    })
    const chatImpl = createImplementer(chatContract)
    const app = chatImpl.router({
      chat: chatImpl.chat.handler(async function* () {
        yield new Blob(['x'])
      }),
    })
    const { client, frames, server } = openPair(app)
    await Promise.all([server.ready, client.ready])

    expect(client.send({ type: 'call', id: '1', path: ['chat'] }).ok).toBe(true)
    const result = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(result).toEqual({
      type: 'result',
      id: '1',
      ok: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'File values are not supported in streams',
      },
    })
    server.close()
  })

  it('ignores in-item after in-done', async () => {
    const seen: number[] = []
    const ingestContract = router({
      ingest: procedure.output(z.object({ count: z.number() })),
    })
    const ingestImpl = createImplementer(ingestContract)
    const app = ingestImpl.router({
      ingest: ingestImpl.ingest.handler(async ({ input }) => {
        for await (const item of input as unknown as AsyncIterable<{
          chunk: number
        }>) {
          seen.push(item.chunk)
        }
        return { count: seen.reduce((sum, n) => sum + n, 0) }
      }),
    })
    const { client, frames, server } = openPair(app)
    await Promise.all([server.ready, client.ready])

    expect(
      client.send({
        type: 'call',
        id: '1',
        path: ['ingest'],
        stream: true,
      }).ok,
    ).toBe(true)
    expect(
      client.send({
        type: 'in-item',
        id: '1',
        input: { chunk: 1 },
      }).ok,
    ).toBe(true)
    expect(client.send({ type: 'in-done', id: '1' }).ok).toBe(true)
    expect(
      client.send({
        type: 'in-item',
        id: '1',
        input: { chunk: 99 },
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
      output: { count: 1 },
    })
    expect(seen).toEqual([1])
    server.close()
  })
})
