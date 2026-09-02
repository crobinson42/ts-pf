import {
  asResult,
  createClient,
  FetchLink,
  isLocalFailure,
} from '@ts-pf/client'
import { fetchFor } from 'ts-pf-example-shared/test-fetch'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { contract } from '../src/contract.js'
import { handler } from '../src/server.js'

describe('02-errors', () => {
  const client = createClient<typeof contract>(
    new FetchLink({
      url: 'http://127.0.0.1/rpc',
      fetch: fetchFor(handler, {}),
    }),
  )

  it('finds a planet', async () => {
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
  })

  it('narrows declared NOT_FOUND data', async () => {
    const result = await asResult(client.planet.find({ id: 999 }))
    expect(result.ok).toBe(false)
    if (!result.ok && result.error.code === 'NOT_FOUND') {
      expectTypeOf(result.error.data).toEqualTypeOf<{ id: number }>()
      expect(result.error.data).toEqual({ id: 999 })
    }
  })

  it('returns VALIDATION for bad input', async () => {
    const result = await asResult(client.planet.find({ id: 'x' as never }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION')
    }
  })

  it('returns undeclared UNAUTHORIZED from PFError', async () => {
    const result = await asResult(client.planet.locked())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED')
    }
  })

  it('treats fetch throws as local failures', async () => {
    const syscall = new Error('connect ECONNREFUSED 127.0.0.1:80')
    const fetchError = new TypeError('fetch failed')
    fetchError.cause = syscall
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://127.0.0.1/rpc',
        fetch: async () => {
          throw fetchError
        },
      }),
    )
    const result = await asResult(client.planet.find({ id: 1 }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(isLocalFailure(result.error)).toBe(true)
      if (isLocalFailure(result.error)) {
        expect(result.error.cause).toBe(fetchError)
      }
    }
  })
})
