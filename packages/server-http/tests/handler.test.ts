import { procedure, router } from '@ts-pf/contract'
import { createImplementer } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { describe, expect, it, vi } from 'vitest'
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

describe('FetchHandler validation', () => {
  const pingContract = router({
    ping: procedure.output(z.string()),
  })
  const pingImpl = createImplementer(pingContract)
  const pingApp = pingImpl.router({
    ping: pingImpl.ping.handler(async () => 1 as never),
  })

  async function post(handler: FetchHandler) {
    const result = await handler.handle(
      new Request('http://localhost/rpc/ping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: null }),
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    return result.response
  }

  it('returns the handler output when output validation is off', async () => {
    const response = await post(new FetchHandler(pingApp))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, output: 1 })
  })

  it('returns INTERNAL when output validation is on', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await post(
      new FetchHandler(pingApp, { validation: { output: true } }),
    )
    expect(errorSpy).toHaveBeenCalledTimes(1)
    errorSpy.mockRestore()
    expect(response.status).toBe(500)
    const body = (await response.json()) as {
      ok: false
      error: { code: string; data?: unknown }
    }
    expect(body).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL', message: 'Internal server error' },
    })
    expect(body.error.data).toBeUndefined()
  })
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

  it('uses the codec content-type on success', async () => {
    const handlerWithCodec = new FetchHandler(app, {
      codec: {
        encodeRequest: (req) => ({
          contentType: 'application/json',
          body: JSON.stringify(req),
        }),
        decodeRequest: async (source) =>
          JSON.parse(await source.text()) as { input?: unknown },
        encodeSuccess: (output) => ({
          contentType: 'application/x-test+json',
          body: JSON.stringify({ ok: true, output }),
        }),
        encodeFailure: (error) => ({
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error }),
        }),
        decodeResponse: async (source) => JSON.parse(await source.text()),
      },
    })
    const result = await handlerWithCodec.handle(
      new Request('http://localhost/rpc/planet/find', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: { id: 1 } }),
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.headers.get('content-type')).toBe(
      'application/x-test+json',
    )
  })

  it('forwards a ReadableStream codec body', async () => {
    const line = `${JSON.stringify({ ok: true, output: { id: 1 } })}\n`
    const handlerWithCodec = new FetchHandler(app, {
      codec: {
        encodeRequest: (req) => ({
          contentType: 'application/json',
          body: JSON.stringify(req),
        }),
        decodeRequest: async (source) =>
          JSON.parse(await source.text()) as { input?: unknown },
        encodeSuccess: () => ({
          contentType: 'application/jsonl',
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(line))
              controller.close()
            },
          }),
        }),
        encodeFailure: (error) => ({
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error }),
        }),
        decodeResponse: async (source) => JSON.parse(await source.text()),
      },
    })
    const result = await handlerWithCodec.handle(
      new Request('http://localhost/rpc/planet/find', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: { id: 1 } }),
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.headers.get('content-type')).toBe(
      'application/jsonl',
    )
    expect(result.response.headers.get('cache-control')).toBe(
      'no-cache, no-transform',
    )
    expect(result.response.headers.get('x-accel-buffering')).toBe('no')
    expect(await result.response.text()).toBe(line)
  })

  it('does not set anti-buffering headers on JSON string bodies', async () => {
    const result = await handler.handle(
      new Request('http://localhost/rpc/planet/find', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ts-pf-protocol': '1',
        },
        body: JSON.stringify({ input: { id: 1 } }),
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.headers.get('cache-control')).toBeNull()
    expect(result.response.headers.get('x-accel-buffering')).toBeNull()
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

describe('FetchHandler protocol version header', () => {
  const handler = new FetchHandler(app)

  function find(headers: Record<string, string>, method = 'POST'): Request {
    return new Request('http://localhost/rpc/planet/find', {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: method === 'POST' ? JSON.stringify({ input: { id: 1 } }) : null,
    })
  }

  async function handle(request: Request) {
    const result = await handler.handle(request, {
      prefix: '/rpc',
      context: {},
    })
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    return result.response
  }

  it('accepts a request without the header', async () => {
    const response = await handle(find({}))
    expect(response.status).toBe(200)
    expect(response.headers.get('x-ts-pf-protocol')).toBe('1')
  })

  it('accepts the supported major', async () => {
    const response = await handle(find({ 'x-ts-pf-protocol': '1' }))
    expect(response.status).toBe(200)
  })

  it('tolerates surrounding whitespace', async () => {
    const response = await handle(find({ 'x-ts-pf-protocol': ' 1 ' }))
    expect(response.status).toBe(200)
  })

  it('answers 400 BAD_REQUEST for another major without reading the body', async () => {
    const request = find({ 'x-ts-pf-protocol': '2' })
    const response = await handle(request)
    expect(response.status).toBe(400)
    expect(response.headers.get('x-ts-pf-protocol')).toBe('1')
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'Unsupported protocol version' },
    })
    expect(request.bodyUsed).toBe(false)
  })

  it.each(['1.0', '', '1, 1', 'one'])(
    'answers 400 BAD_REQUEST for %j',
    async (value) => {
      const response = await handle(find({ 'x-ts-pf-protocol': value }))
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Unsupported protocol version' },
      })
    },
  )

  it('checks the method before the version', async () => {
    const response = await handle(find({ 'x-ts-pf-protocol': '2' }, 'GET'))
    expect(response.status).toBe(405)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'METHOD_NOT_ALLOWED' },
    })
  })

  it('checks the version before the lookup and reaches onError', async () => {
    const seen: unknown[] = []
    const reporting = new FetchHandler(app, {
      onError(error) {
        seen.push(error)
      },
    })
    const result = await reporting.handle(
      new Request('http://localhost/rpc/nope', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ts-pf-protocol': '2',
        },
        body: 'not json',
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(400)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Unsupported protocol version',
    })
  })
})

describe('FetchHandler lookup before decode', () => {
  const handler = new FetchHandler(app)

  async function handle(request: Request, h: FetchHandler = handler) {
    const result = await h.handle(request, { prefix: '/rpc', context: {} })
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    return result.response
  }

  it('answers 404 NOT_FOUND for an unknown path with an invalid JSON body', async () => {
    const response = await handle(
      new Request('http://localhost/rpc/nope', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      }),
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
  })

  it('still answers 400 BAD_REQUEST for a known path with an invalid JSON body', async () => {
    const response = await handle(
      new Request('http://localhost/rpc/planet/find', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'BAD_REQUEST' },
    })
  })

  it('never calls codec.decodeRequest or reads the body for an unknown path', async () => {
    const decodeRequest = vi.fn()
    // An errored body would be a 500 if anything read it.
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('body should not be read on a 404'))
      },
    })
    const spyCodec = new FetchHandler(app, {
      codec: {
        encodeRequest: (req) => ({
          contentType: 'application/json',
          body: JSON.stringify(req),
        }),
        decodeRequest,
        encodeSuccess: (output) => ({
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, output }),
        }),
        encodeFailure: (error) => ({
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error }),
        }),
        decodeResponse: async () => {
          throw new Error('unused')
        },
      },
    })
    const request = new Request('http://localhost/rpc/nope', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    const response = await handle(request, spyCodec)
    expect(response.status).toBe(404)
    expect(decodeRequest).not.toHaveBeenCalled()
    expect(request.bodyUsed).toBe(false)
  })

  it('answers 405 METHOD_NOT_ALLOWED for a GET on an unknown path', async () => {
    const response = await handle(
      new Request('http://localhost/rpc/nope', { method: 'GET' }),
    )
    expect(response.status).toBe(405)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'METHOD_NOT_ALLOWED' },
    })
  })
})
