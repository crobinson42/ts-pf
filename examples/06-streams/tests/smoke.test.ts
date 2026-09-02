import { createClient, FetchLink } from '@ts-pf/client'
import { fetchFor } from 'ts-pf-example-shared/test-fetch'
import { describe, expect, it } from 'vitest'
import type { contract } from '../src/contract.js'
import { codec, handler } from '../src/server.js'

describe('06-streams', () => {
  const client = createClient<typeof contract>(
    new FetchLink({
      url: 'http://127.0.0.1/rpc',
      fetch: fetchFor(handler, {}),
      codec,
    }),
  )

  it('streams output tokens', async () => {
    const tokens = await client.planet.chat({ prompt: 'hello mars' })
    const collected: string[] = []
    for await (const item of tokens) {
      collected.push(item.token)
    }
    expect(collected).toEqual(['hello', 'mars'])
  })

  it('streams input chunks', async () => {
    async function* chunks() {
      yield { chunk: 1 }
      yield { chunk: 2 }
    }
    expect(await client.planet.ingest(chunks())).toEqual({ count: 3 })
  })

  it('sends JSON for unary procedures', async () => {
    const types: string[] = []
    const inner = fetchFor(handler, {})
    const jsonClient = createClient<typeof contract>(
      new FetchLink({
        url: 'http://127.0.0.1/rpc',
        fetch: async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          types.push(req.headers.get('content-type') ?? '')
          return inner(req)
        },
        codec,
      }),
    )
    expect(await jsonClient.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
    expect(types[0]?.startsWith('application/json')).toBe(true)
  })
})
