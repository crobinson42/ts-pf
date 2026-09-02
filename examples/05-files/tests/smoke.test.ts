import { createClient, FetchLink } from '@ts-pf/client'
import { fetchFor } from 'ts-pf-example-shared/test-fetch'
import { describe, expect, it } from 'vitest'
import type { contract } from '../src/contract.js'
import { codec, handler } from '../src/server.js'

describe('05-files', () => {
  it('uploads and downloads files', async () => {
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://127.0.0.1/rpc',
        fetch: fetchFor(handler, {}),
        codec,
      }),
    )
    const photo = new File(['hello'], 'earth.png', { type: 'image/png' })
    const uploaded = await client.planet.upload({ title: 'Earth', photo })
    expect(uploaded).toEqual({ id: 1, title: 'Earth', size: 5 })
    const pdf = await client.planet.download({ id: uploaded.id })
    expect(pdf).toBeInstanceOf(File)
    expect(pdf.name).toBe('earth.png')
    expect(await pdf.text()).toBe('hello')
  })

  it('sends JSON for procedures without files', async () => {
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
    expect(await jsonClient.planet.list()).toEqual([
      { id: 1, name: 'Earth' },
      { id: 2, name: 'Mars' },
    ])
    expect(types[0]?.startsWith('application/json')).toBe(true)
  })
})
