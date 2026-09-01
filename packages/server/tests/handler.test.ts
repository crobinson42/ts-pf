import { procedure, router } from '@ts-pf/contract'
import { createImplementer, FetchHandler } from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
  },
})

const impl = createImplementer(contract)
const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input }) => ({
      id: input.id,
      name: 'Earth',
    })),
  },
})

describe('FetchHandler', () => {
  const handler = new FetchHandler(app)

  it('handles POST /rpc/planet/find', async () => {
    const req = new Request('http://localhost/rpc/planet/find', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ts-pf-protocol': '1' },
      body: JSON.stringify({ input: { id: 1 } }),
    })
    const result = await handler.handle(req, {
      prefix: '/rpc',
      context: {},
    })
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(200)
    expect(await result.response.json()).toEqual({
      ok: true,
      output: { id: 1, name: 'Earth' },
    })
  })

  it('returns matched:false when prefix does not match', async () => {
    const result = await handler.handle(
      new Request('http://localhost/health'),
      {
        prefix: '/rpc',
        context: {},
      },
    )
    expect(result.matched).toBe(false)
  })

  it('404 NOT_FOUND for unknown procedure under prefix', async () => {
    const result = await handler.handle(
      new Request('http://localhost/rpc/nope', { method: 'POST', body: '{}' }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(404)
    expect(await result.response.json()).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
  })

  it('rejects non-POST with 405 METHOD_NOT_ALLOWED', async () => {
    const result = await handler.handle(
      new Request('http://localhost/rpc/planet/find', { method: 'GET' }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(405)
    expect(await result.response.json()).toMatchObject({
      ok: false,
      error: { code: 'METHOD_NOT_ALLOWED' },
    })
  })
})
