import { asResult, createClient, FetchLink } from '@ts-pf/client'
import type { contract } from '@ts-pf/example-mvc-kit-contract'
import { fetchFor } from 'ts-pf-example-shared/test-fetch'
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db.js'
import { handler } from '../src/server.js'

function client() {
  return createClient<typeof contract>(
    new FetchLink({
      url: 'http://127.0.0.1/rpc',
      fetch: fetchFor(handler, { db: createDb() }),
    }),
  )
}

describe('15-mvc-kit api', () => {
  it('lists, finds, and creates planets', async () => {
    const rpc = client()
    expect(await rpc.planet.list()).toEqual([
      { id: 1, name: 'Earth' },
      { id: 2, name: 'Mars' },
    ])
    expect(await rpc.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
    expect(await rpc.planet.create({ name: 'Venus' })).toEqual({
      id: 3,
      name: 'Venus',
    })
  })

  it('narrows NOT_FOUND on find', async () => {
    const result = await asResult(client().planet.find({ id: 999 }))
    expect(result.ok).toBe(false)
    if (!result.ok && result.error.code === 'NOT_FOUND') {
      expect(result.error.data).toEqual({ id: 999 })
    }
  })

  it('returns VALIDATION on empty create name', async () => {
    const result = await asResult(
      client().planet.create({ name: '' } as { name: string }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION')
    }
  })
})
