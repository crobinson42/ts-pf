import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import { procedure, router } from '@ts-pf/contract'
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
