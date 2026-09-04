import { describe, expect, it } from 'vitest'
import { createPlanetClient } from '../src/client.js'
import worker from '../src/server.js'

const fetchImpl: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init)
  return worker.fetch(req)
}

describe('hello', () => {
  const client = createPlanetClient(fetchImpl)

  it('lists, finds, and creates planets', async () => {
    const listed = await client.planet.list()
    expect(listed).toEqual(
      expect.arrayContaining([
        { id: 1, name: 'Earth' },
        { id: 2, name: 'Mars' },
      ]),
    )
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
    expect(await client.planet.create({ name: 'Venus' })).toEqual({
      id: 3,
      name: 'Venus',
    })
  })
})
