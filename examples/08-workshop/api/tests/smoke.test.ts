import { asResult, createClient, FetchLink } from '@ts-pf/client'
import type { contract } from '@ts-pf/example-workshop-contract'
import { fetchFor } from 'ts-pf-example-shared/test-fetch'
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db.js'
import { codec, handler } from '../src/server.js'

function client(headers?: HeadersInit) {
  return createClient<typeof contract>(
    new FetchLink({
      url: 'http://127.0.0.1/rpc',
      fetch: fetchFor(handler, { db: createDb() }),
      codec,
      ...(headers ? { headers } : {}),
    }),
  )
}

describe('08-workshop api', () => {
  it('lists planets', async () => {
    expect(await client().planet.list()).toEqual([
      { id: 1, name: 'Earth' },
      { id: 2, name: 'Mars' },
    ])
  })

  it('narrows NOT_FOUND on find', async () => {
    const result = await asResult(client().planet.find({ id: 999 }))
    expect(result.ok).toBe(false)
    if (!result.ok && result.error.code === 'NOT_FOUND') {
      expect(result.error.data).toEqual({ id: 999 })
    }
  })

  it('rejects create without a bearer token', async () => {
    const result = await asResult(client().planet.create({ name: 'Venus' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED')
    }
  })

  it('creates with Authorization: Bearer demo', async () => {
    expect(
      await client({ authorization: 'Bearer demo' }).planet.create({
        name: 'Venus',
      }),
    ).toEqual({ id: 3, name: 'Venus' })
  })

  it('streams describe tokens', async () => {
    const tokens = await client().planet.describe({ id: 1 })
    const collected: string[] = []
    for await (const item of tokens) {
      collected.push(item.token)
    }
    expect(collected.join(' ')).toContain('Earth')
  })
})
