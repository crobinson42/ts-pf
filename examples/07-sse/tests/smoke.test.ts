import { createClient, FetchLink } from '@ts-pf/client'
import { SSE_CONTENT_TYPE } from '@ts-pf/sse'
import { fetchFor } from 'ts-pf-example-shared/test-fetch'
import { describe, expect, it } from 'vitest'
import type { contract } from '../src/contract.js'
import { codec, handler } from '../src/server.js'

describe('07-sse', () => {
  const client = createClient<typeof contract>(
    new FetchLink({
      url: 'http://127.0.0.1/rpc',
      fetch: fetchFor(handler, {}),
      codec,
    }),
  )

  it('streams output as SSE', async () => {
    const types: string[] = []
    const inner = fetchFor(handler, {})
    const sseClient = createClient<typeof contract>(
      new FetchLink({
        url: 'http://127.0.0.1/rpc',
        fetch: async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          const res = await inner(req)
          types.push(res.headers.get('content-type') ?? '')
          return res
        },
        codec,
      }),
    )
    const tokens = await sseClient.planet.chat({ prompt: 'hello mars' })
    const collected: string[] = []
    for await (const item of tokens) {
      collected.push(item.token)
    }
    expect(collected).toEqual(['hello', 'mars'])
    expect(types[0]?.startsWith(SSE_CONTENT_TYPE)).toBe(true)
  })

  it('keeps input streams JSONL', async () => {
    async function* chunks() {
      yield { chunk: 1 }
      yield { chunk: 2 }
    }
    expect(await client.planet.ingest(chunks())).toEqual({ count: 3 })
  })

  it('still serves unary JSON', async () => {
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
  })
})
