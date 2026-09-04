import { describe, expect, it } from 'vitest'
import { createPlanetClient } from '../src/client.js'
import worker from '../src/server.js'

const fetchImpl: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init)
  return worker.fetch(req)
}

describe('stream', () => {
  const client = createPlanetClient(fetchImpl)

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
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
  })
})
