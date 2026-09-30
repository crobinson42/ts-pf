import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import { procedure, router } from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import { createImplementer, createLocalClient } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { StreamCodec, stream } from '@ts-pf/stream'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
    chat: procedure
      .input(z.object({ prompt: z.string() }))
      .output(stream(z.object({ token: z.string() }))),
    ingest: procedure
      .input(stream(z.object({ chunk: z.number() })))
      .output(z.object({ count: z.number() })),
  },
})

const impl = createImplementer(contract)
const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input }) => ({
      id: input.id,
      name: 'Earth',
    })),
    chat: impl.planet.chat.handler(async function* ({ input }) {
      yield { token: input.prompt.slice(0, 1) }
      yield { token: input.prompt.slice(1) }
    }),
    ingest: impl.planet.ingest.handler(async ({ input }) => {
      let count = 0
      for await (const item of input) {
        count += item.chunk
      }
      return { count }
    }),
  },
})

const codec = new StreamCodec()
const handler = new FetchHandler(app, { codec })

function fetchFor(onRequest?: (req: Request) => void): typeof fetch {
  return async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init)
    onRequest?.(req)
    const result = await handler.handle(req, { prefix: '/rpc', context: {} })
    if (!result.matched) {
      return new Response('not found', { status: 404 })
    }
    return result.response
  }
}

describe('stream item validation', () => {
  const itemContract = router({
    chat: procedure.output(stream(z.object({ token: z.string() }))),
    ingest: procedure
      .input(stream(z.object({ chunk: z.number() })))
      .output(z.object({ items: z.array(z.unknown()) })),
  })
  const itemImpl = createImplementer(itemContract)
  const itemApp = itemImpl.router({
    chat: itemImpl.chat.handler(async function* () {
      yield { token: 1 as never }
    }),
    ingest: itemImpl.ingest.handler(async ({ input }) => {
      const items: unknown[] = []
      for await (const item of input) {
        items.push(item)
      }
      return { items }
    }),
  })

  async function* badChunks(): AsyncIterable<{ chunk: number }> {
    yield { chunk: 'x' as never }
  }

  it('yields a stream output item that fails the item schema', async () => {
    const local = createLocalClient(itemApp, { context: {} })
    const tokens = await local.chat()
    const collected: unknown[] = []
    for await (const token of tokens) {
      collected.push(token)
    }
    expect(collected).toEqual([{ token: 1 }])
  })

  it('rejects a bad stream output item when output validation is on', async () => {
    const local = createLocalClient(itemApp, {
      context: {},
      validation: { output: true },
    })
    const tokens = await local.chat()
    const err = await (async () => {
      for await (const _token of tokens) {
        // drain
      }
      return undefined
    })().then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(err).toBeInstanceOf(PFError)
    expect(err).toMatchObject({
      code: 'VALIDATION',
      data: { issues: [{ message: expect.any(String) }] },
    })
  })

  it('rejects a bad stream input item by default', async () => {
    const local = createLocalClient(itemApp, { context: {} })
    await expect(local.ingest(badChunks())).rejects.toMatchObject({
      code: 'VALIDATION',
    })
  })

  it('delivers a bad stream input item when input validation is off', async () => {
    const local = createLocalClient(itemApp, {
      context: {},
      validation: { input: false },
    })
    expect(await local.ingest(badChunks())).toEqual({
      items: [{ chunk: 'x' }],
    })
  })
})

describe('StreamCodec e2e', () => {
  it('streams output tokens', async () => {
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: fetchFor(),
        codec,
      }),
    )
    const tokens = await client.planet.chat({ prompt: 'Hi' })
    const collected: { token: string }[] = []
    for await (const token of tokens) {
      collected.push(token)
    }
    expect(collected).toEqual([{ token: 'H' }, { token: 'i' }])
  })

  it('streams input chunks', async () => {
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: fetchFor(),
        codec,
      }),
    )
    async function* chunks() {
      yield { chunk: 1 }
      yield { chunk: 2 }
    }
    expect(await client.planet.ingest(chunks())).toEqual({ count: 3 })
  })

  it('sends JSON for procedures without streams', async () => {
    const types: string[] = []
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: fetchFor((req) => {
          types.push(req.headers.get('content-type') ?? '')
        }),
        codec,
      }),
    )
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
    expect(types[0]?.startsWith('application/json')).toBe(true)
  })

  it('accepts a JSON-only client for JSON procedures', async () => {
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: fetchFor(),
      }),
    )
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
  })

  it('passes a live generator through createLocalClient', async () => {
    const local = createLocalClient(app, { context: {} })
    const tokens = await local.planet.chat({ prompt: 'Hi' })
    const collected: { token: string }[] = []
    for await (const token of tokens) {
      collected.push(token)
    }
    expect(collected).toEqual([{ token: 'H' }, { token: 'i' }])
  })
})
