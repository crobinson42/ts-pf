import { createClient, FetchLink } from '@ts-pf/client'
import { fetchFor } from 'ts-pf-example-shared/test-fetch'
import { describe, expect, it } from 'vitest'
import type { contract } from '../src/contract.js'
import { handler } from '../src/server.js'

describe('01-hello', () => {
  const client = createClient<typeof contract>(
    new FetchLink({
      url: 'http://127.0.0.1/rpc',
      fetch: fetchFor(handler, {}),
    }),
  )

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
