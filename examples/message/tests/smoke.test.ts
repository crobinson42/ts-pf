import { describe, expect, it } from 'vitest'
import { createPlanetClient } from '../src/client.js'
import { bind } from '../src/server.js'

describe('message', () => {
  it('lists, finds, and creates planets over MessagePort', async () => {
    const { port1, port2 } = new MessageChannel()
    const server = bind(port1)
    const { client, close } = createPlanetClient(port2)

    try {
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
    } finally {
      close()
      server.close()
    }
  })
})
