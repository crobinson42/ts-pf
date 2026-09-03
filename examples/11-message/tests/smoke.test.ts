import { createClient } from '@ts-pf/client'
import { PortLink } from '@ts-pf/message-client'
import { describe, expect, it } from 'vitest'
import type { contract } from '../src/contract.js'
import { bind } from '../src/server.js'

describe('11-message', () => {
  it('lists, finds, and creates planets over MessagePort', async () => {
    const { port1, port2 } = new MessageChannel()
    const server = bind(port1)
    const link = new PortLink({ port: port2 })
    const client = createClient<typeof contract>(link)

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
      link.close()
      server.close()
    }
  })
})
