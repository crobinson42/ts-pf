import { procedure, router } from '@ts-pf/contract'
import { createImplementer } from '@ts-pf/server'
import {
  CORSPlugin,
  FetchHandler,
  RequestLimitPlugin,
} from '@ts-pf/server-http'
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

describe('RequestLimitPlugin', () => {
  it('rejects when Content-Length exceeds maxBodySize', async () => {
    const handler = new FetchHandler(app, {
      plugins: [new RequestLimitPlugin({ maxBodySize: 10 })],
    })
    const result = await handler.handle(
      new Request('http://localhost/rpc/planet/find', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '100',
        },
        body: '{}',
      }),
      { prefix: '/rpc', context: {} },
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

  it('rejects when a streamed body exceeds maxBodySize', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"input":{"id":1}}'))
        controller.close()
      },
    })
    const handler = new FetchHandler(app, {
      plugins: [new RequestLimitPlugin({ maxBodySize: 5 })],
    })
    const result = await handler.handle(
      new Request('http://localhost/rpc/planet/find', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' }),
      { prefix: '/rpc', context: {} },
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

  it('allows a body under the limit', async () => {
    const payload = JSON.stringify({ input: { id: 1 } })
    const handler = new FetchHandler(app, {
      plugins: [new RequestLimitPlugin({ maxBodySize: 1024 })],
    })
    const result = await handler.handle(
      new Request('http://localhost/rpc/planet/find', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      }),
      { prefix: '/rpc', context: {} },
    )
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

  it('answers 404 for an unknown path with an oversized streamed body (never read)', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"input":{"id":1}}'))
        controller.close()
      },
    })
    const handler = new FetchHandler(app, {
      plugins: [new RequestLimitPlugin({ maxBodySize: 5 })],
    })
    const result = await handler.handle(
      new Request('http://localhost/rpc/nope', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' }),
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

  it('still answers 413 for an unknown path when Content-Length exceeds maxBodySize', async () => {
    const handler = new FetchHandler(app, {
      plugins: [new RequestLimitPlugin({ maxBodySize: 10 })],
    })
    const result = await handler.handle(
      new Request('http://localhost/rpc/nope', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '100',
        },
        body: '{}',
      }),
      { prefix: '/rpc', context: {} },
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

  it('still applies CORS headers on a 413', async () => {
    const handler = new FetchHandler(app, {
      plugins: [new CORSPlugin(), new RequestLimitPlugin({ maxBodySize: 10 })],
    })
    const result = await handler.handle(
      new Request('http://localhost/rpc/planet/find', {
        method: 'POST',
        headers: {
          origin: 'https://app.example.com',
          'content-type': 'application/json',
          'content-length': '100',
        },
        body: '{}',
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(413)
    expect(result.response.headers.get('access-control-allow-origin')).toBe('*')
  })

  describe('with a Request-shaped object undici cannot clone (srvx on Node)', () => {
    // Passes `instanceof Request` without being an undici Request, like srvx's
    // lazy Node request: `new Request(it, init)` throws on its private state.
    function foreignRequest(native: Request): Request {
      return Object.create(Request.prototype, {
        url: { value: native.url },
        method: { value: native.method },
        headers: { value: native.headers },
        body: { get: () => native.body },
        signal: { value: native.signal },
      }) as Request
    }

    function findRequest(init: RequestInit & { duplex?: 'half' }): Request {
      return foreignRequest(
        new Request('http://localhost/rpc/planet/find', {
          method: 'POST',
          ...init,
          headers: { 'content-type': 'application/json', ...init.headers },
        }),
      )
    }

    it('is not cloneable by new Request(request, init)', () => {
      expect(() => new Request(findRequest({ body: '{}' }), {})).toThrow(
        TypeError,
      )
    })

    it('allows a body under the limit', async () => {
      const handler = new FetchHandler(app, {
        plugins: [new RequestLimitPlugin({ maxBodySize: 1024 })],
      })
      const result = await handler.handle(
        findRequest({ body: JSON.stringify({ input: { id: 1 } }) }),
        { prefix: '/rpc', context: {} },
      )
      if (!result.matched) {
        throw new Error('expected match')
      }
      expect(result.response.status).toBe(200)
      expect(await result.response.json()).toEqual({
        ok: true,
        output: { id: 1, name: 'Earth' },
      })
    })

    it('rejects a streamed body over the limit', async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"input":{"id":1}}'))
          controller.close()
        },
      })
      const handler = new FetchHandler(app, {
        plugins: [new RequestLimitPlugin({ maxBodySize: 5 })],
      })
      const result = await handler.handle(
        findRequest({ body, duplex: 'half' }),
        { prefix: '/rpc', context: {} },
      )
      if (!result.matched) {
        throw new Error('expected match')
      }
      expect(result.response.status).toBe(413)
      expect(await result.response.json()).toMatchObject({
        ok: false,
        error: { code: 'PAYLOAD_TOO_LARGE' },
      })
    })

    it('keeps method, headers, and signal on the wrapped request', async () => {
      const controller = new AbortController()
      let seen: Request | undefined
      const handler = new FetchHandler(app, {
        plugins: [new RequestLimitPlugin({ maxBodySize: 1024 })],
      })
      await handler.handle(
        findRequest({
          body: JSON.stringify({ input: { id: 1 } }),
          headers: { 'x-trace': 'abc' },
          signal: controller.signal,
        }),
        {
          prefix: '/rpc',
          context: (req) => {
            seen = req
            return {}
          },
        },
      )
      expect(seen?.url).toBe('http://localhost/rpc/planet/find')
      expect(seen?.method).toBe('POST')
      expect(seen?.headers.get('x-trace')).toBe('abc')
      expect(seen?.signal.aborted).toBe(false)
      controller.abort()
      expect(seen?.signal.aborted).toBe(true)
    })
  })
})
