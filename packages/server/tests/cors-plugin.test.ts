import { procedure, router } from '@ts-pf/contract'
import { CORSPlugin, createImplementer, FetchHandler } from '@ts-pf/server'
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

describe('CORSPlugin', () => {
  it('answers OPTIONS preflight with 204 and CORS headers', async () => {
    const handler = new FetchHandler(app, { plugins: [new CORSPlugin()] })
    const result = await handler.handle(
      new Request('http://localhost/rpc/planet/find', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://app.example.com',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,x-ts-pf-protocol',
        },
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(204)
    expect(result.response.headers.get('access-control-allow-origin')).toBe('*')
    expect(result.response.headers.get('access-control-allow-methods')).toBe(
      'POST',
    )
    expect(result.response.headers.get('access-control-allow-headers')).toBe(
      'content-type,x-ts-pf-protocol',
    )
    expect(result.response.headers.get('x-ts-pf-protocol')).toBeNull()
    expect(await result.response.text()).toBe('')
  })

  it('adds CORS headers to a successful POST', async () => {
    const handler = new FetchHandler(app, { plugins: [new CORSPlugin()] })
    const result = await handler.handle(
      new Request('http://localhost/rpc/planet/find', {
        method: 'POST',
        headers: {
          origin: 'https://app.example.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ input: { id: 1 } }),
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(200)
    expect(result.response.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('adds CORS headers to 404 and 405', async () => {
    const handler = new FetchHandler(app, { plugins: [new CORSPlugin()] })
    const notFound = await handler.handle(
      new Request('http://localhost/rpc/nope', {
        method: 'POST',
        headers: { origin: 'https://app.example.com' },
        body: '{}',
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(notFound.matched).toBe(true)
    if (!notFound.matched) {
      throw new Error('expected match')
    }
    expect(notFound.response.status).toBe(404)
    expect(notFound.response.headers.get('access-control-allow-origin')).toBe(
      '*',
    )

    const notAllowed = await handler.handle(
      new Request('http://localhost/rpc/planet/find', {
        method: 'GET',
        headers: { origin: 'https://app.example.com' },
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(notAllowed.matched).toBe(true)
    if (!notAllowed.matched) {
      throw new Error('expected match')
    }
    expect(notAllowed.response.status).toBe(405)
    expect(notAllowed.response.headers.get('access-control-allow-origin')).toBe(
      '*',
    )
  })

  it('reflects an allowlisted origin and sets Vary', async () => {
    const handler = new FetchHandler(app, {
      plugins: [new CORSPlugin({ origin: ['https://app.example.com'] })],
    })
    const allowed = await handler.handle(
      new Request('http://localhost/rpc/planet/find', {
        method: 'POST',
        headers: {
          origin: 'https://app.example.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ input: { id: 1 } }),
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(allowed.matched).toBe(true)
    if (!allowed.matched) {
      throw new Error('expected match')
    }
    expect(allowed.response.headers.get('access-control-allow-origin')).toBe(
      'https://app.example.com',
    )
    expect(allowed.response.headers.get('vary')).toBe('Origin')

    const denied = await handler.handle(
      new Request('http://localhost/rpc/planet/find', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ input: { id: 1 } }),
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(denied.matched).toBe(true)
    if (!denied.matched) {
      throw new Error('expected match')
    }
    expect(
      denied.response.headers.get('access-control-allow-origin'),
    ).toBeNull()
    expect(denied.response.headers.get('vary')).toBe('Origin')
  })

  it('throws when credentials is true with the default wildcard origin', () => {
    expect(() => new CORSPlugin({ credentials: true })).toThrow(
      /credentials cannot be used with origin "\*"/,
    )
  })

  it('reflects origin and sets credentials when configured', async () => {
    const handler = new FetchHandler(app, {
      plugins: [
        new CORSPlugin({
          credentials: true,
          origin: (origin) => origin,
        }),
      ],
    })
    const result = await handler.handle(
      new Request('http://localhost/rpc/planet/find', {
        method: 'POST',
        headers: {
          origin: 'https://app.example.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ input: { id: 1 } }),
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.headers.get('access-control-allow-origin')).toBe(
      'https://app.example.com',
    )
    expect(
      result.response.headers.get('access-control-allow-credentials'),
    ).toBe('true')
    expect(result.response.headers.get('vary')).toBe('Origin')
  })

  it('does not match or add CORS headers outside the prefix', async () => {
    const handler = new FetchHandler(app, { plugins: [new CORSPlugin()] })
    const result = await handler.handle(
      new Request('http://localhost/health', {
        method: 'OPTIONS',
        headers: { origin: 'https://app.example.com' },
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(false)
  })
})
