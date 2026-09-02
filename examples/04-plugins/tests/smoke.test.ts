import { asResult, createClient, FetchLink } from '@ts-pf/client'
import { fetchFor } from 'ts-pf-example-shared/test-fetch'
import { describe, expect, it } from 'vitest'
import type { Planet } from '../src/app.js'
import type { contract } from '../src/contract.js'
import { retryOnLocalFailure } from '../src/retry-on-local-failure.js'
import { handler } from '../src/server.js'

function db(): Planet[] {
  return [{ id: 1, name: 'Earth' }]
}

describe('04-plugins', () => {
  it('answers CORS preflight', async () => {
    const result = await handler.handle(
      new Request('http://127.0.0.1/rpc/planet/list', {
        method: 'OPTIONS',
        headers: {
          origin: 'http://127.0.0.1:5173',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,x-ts-pf-protocol',
        },
      }),
      { prefix: '/rpc', context: { db: db() } },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(204)
    expect(result.response.headers.get('access-control-allow-origin')).toBe(
      'http://127.0.0.1:5173',
    )
  })

  it('sets response headers from context.resHeaders', async () => {
    const result = await handler.handle(
      new Request('http://127.0.0.1/rpc/planet/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      { prefix: '/rpc', context: { db: db() } },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.headers.get('x-planet-count')).toBe('1')
  })

  it('rejects oversize bodies with PAYLOAD_TOO_LARGE', async () => {
    const result = await handler.handle(
      new Request('http://127.0.0.1/rpc/planet/list', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '2048',
        },
        body: '{}',
      }),
      { prefix: '/rpc', context: { db: db() } },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(413)
    expect(await result.response.json()).toMatchObject({
      ok: false,
      error: { code: 'PAYLOAD_TOO_LARGE' },
    })
  })

  it('attaches authorization through an interceptor', async () => {
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://127.0.0.1/rpc',
        fetch: fetchFor(handler, { db: db() }),
        interceptors: [
          async ({ request, next }) => {
            request.headers.set('authorization', 'Bearer demo')
            return next(request)
          },
        ],
      }),
    )
    expect(await client.planet.create({ name: 'Venus' })).toEqual({
      id: 2,
      name: 'Venus',
    })
  })

  it('forwards AbortSignal', async () => {
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://127.0.0.1/rpc',
        fetch: fetchFor(handler, { db: db() }),
      }),
    )
    const ac = new AbortController()
    ac.abort()
    await expect(
      client.planet.list({ signal: ac.signal }),
    ).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 0,
      message: 'Request aborted',
    })
  })

  it('retries once when fetch throws a non-abort error', async () => {
    let attempts = 0
    const inner = fetchFor(handler, { db: db() })
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://127.0.0.1/rpc',
        fetch: async (input, init) => {
          attempts += 1
          if (attempts === 1) {
            throw new TypeError('fetch failed')
          }
          return inner(input, init)
        },
        interceptors: [retryOnLocalFailure],
      }),
    )
    expect(await client.planet.list()).toEqual([{ id: 1, name: 'Earth' }])
    expect(attempts).toBe(2)
  })

  it('does not retry abort', async () => {
    let attempts = 0
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://127.0.0.1/rpc',
        fetch: async () => {
          attempts += 1
          throw new DOMException('This operation was aborted.', 'AbortError')
        },
        interceptors: [retryOnLocalFailure],
      }),
    )
    const ac = new AbortController()
    ac.abort()
    await expect(
      client.planet.list({ signal: ac.signal }),
    ).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 0,
      message: 'Request aborted',
    })
    expect(attempts).toBe(1)
  })

  it('rejects create without the interceptor', async () => {
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://127.0.0.1/rpc',
        fetch: fetchFor(handler, { db: db() }),
      }),
    )
    const result = await asResult(client.planet.create({ name: 'Nope' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED')
    }
  })
})
