import { asResult, isLocalFailure, RetryPlugin } from '@ts-pf/client'
import { createLocalClient, DedupePlugin } from '@ts-pf/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { app, runtime } from '../src/app.js'
import { audit } from '../src/audit-plugin.js'
import { clientLog, createPlanetClient } from '../src/client.js'
import { GetBridgePlugin } from '../src/get-bridge.js'
import { GET_MAX_URL, getInterceptor } from '../src/get-link.js'
import { readKey } from '../src/read-key.js'
import worker, { serverLog } from '../src/server.js'
import { TimeoutPlugin } from '../src/timeout-plugin.js'

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError')
}

const fetchImpl: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init)
  if (req.signal.aborted) {
    throw abortError()
  }
  return new Promise((resolve, reject) => {
    let settled = false
    const onAbort = () => {
      if (settled) {
        return
      }
      settled = true
      reject(abortError())
    }
    req.signal.addEventListener('abort', onAbort, { once: true })
    worker.fetch(req).then(
      (response) => {
        if (settled) {
          return
        }
        settled = true
        req.signal.removeEventListener('abort', onAbort)
        resolve(response)
      },
      (error) => {
        if (settled) {
          return
        }
        settled = true
        req.signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

describe('plugins', () => {
  beforeEach(() => {
    runtime.reset()
    audit.clear()
    clientLog.length = 0
    serverLog.length = 0
  })

  it('lists, finds, and creates planets', async () => {
    const client = createPlanetClient(fetchImpl)
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
    expect(clientLog).toContain('start planet.find')
    expect(
      serverLog.some((line) => /^start [0-9a-f-]{36} planet\.find$/.test(line)),
    ).toBe(true)
    expect(audit.entries).toEqual(
      expect.arrayContaining([
        { path: 'planet.list', ok: true },
        { path: 'planet.find', ok: true },
        { path: 'planet.create', ok: true },
      ]),
    )
  })

  it('caches sequential finds and skips create', async () => {
    const client = createPlanetClient(fetchImpl)
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
    expect(runtime.hits.find).toBe(1)
    await client.planet.create({ name: 'Venus' })
    await client.planet.create({ name: 'Mercury' })
    expect(runtime.hits.create).toBe(2)
  })

  it('dedupes overlapping finds on the client', async () => {
    runtime.findDelayMs = 40
    const client = createPlanetClient(fetchImpl)
    const [a, b] = await Promise.all([
      client.planet.find({ id: 1 }),
      client.planet.find({ id: 1 }),
    ])
    expect(a).toEqual({ id: 1, name: 'Earth' })
    expect(b).toEqual({ id: 1, name: 'Earth' })
    expect(runtime.hits.find).toBe(1)
  })

  it('dedupes overlapping finds on the server across clients', async () => {
    runtime.findDelayMs = 40
    const first = createPlanetClient(fetchImpl, { plugins: [] })
    const second = createPlanetClient(fetchImpl, { plugins: [] })
    const [a, b] = await Promise.all([
      first.planet.find({ id: 1 }),
      second.planet.find({ id: 1 }),
    ])
    expect(a).toEqual({ id: 1, name: 'Earth' })
    expect(b).toEqual({ id: 1, name: 'Earth' })
    expect(runtime.hits.find).toBe(1)
  })

  it('retries local network failures', async () => {
    let failures = 2
    const flaky: typeof fetch = async (input, init) => {
      if (failures > 0) {
        failures -= 1
        throw new TypeError('Failed to fetch')
      }
      return fetchImpl(input, init)
    }
    const client = createPlanetClient(flaky, {
      plugins: [new RetryPlugin({ retries: 2 })],
    })
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
    expect(failures).toBe(0)
    expect(runtime.hits.find).toBe(1)
  })

  it('aborts a slow call through TimeoutPlugin', async () => {
    runtime.findDelayMs = 200
    const client = createPlanetClient(fetchImpl, {
      plugins: [new TimeoutPlugin(20)],
    })
    const result = await asResult(client.planet.find({ id: 1 }))
    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('expected timeout')
    }
    expect(isLocalFailure(result.error)).toBe(true)
  })

  it('returns NOT_FOUND without retrying', async () => {
    const client = createPlanetClient(fetchImpl)
    const result = await asResult(client.planet.find({ id: 99 }))
    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('expected NOT_FOUND')
    }
    expect(result.error.code).toBe('NOT_FOUND')
    if (result.error.code === 'NOT_FOUND') {
      expect(result.error.data.id).toBe(99)
    }
    expect(runtime.hits.find).toBe(1)
    expect(audit.entries).toEqual([{ path: 'planet.find', ok: false }])
  })

  it('answers CORS preflight on the HTTP plugin plane', async () => {
    const response = await worker.fetch(
      new Request('http://127.0.0.1/rpc/planet/find', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://app.example.com',
          'access-control-request-method': 'POST',
        },
      }),
    )
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(runtime.hits.find).toBe(0)
    expect(audit.entries).toEqual([])
  })

  it('sends opted-in reads as cacheable GETs and writes as POSTs', async () => {
    const sent: {
      method: string
      url: string
      protocol: string | null
      cacheControl: string | null
    }[] = []
    const recording: typeof fetch = async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init)
      const response = await fetchImpl(req)
      sent.push({
        method: req.method,
        url: req.url,
        protocol: req.headers.get('x-ts-pf-protocol'),
        cacheControl: response.headers.get('cache-control'),
      })
      return response
    }
    const client = createPlanetClient(recording, { plugins: [] })
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
    await client.planet.create({ name: 'Venus' })
    await asResult(client.planet.find({ id: 99 }))
    expect(sent).toEqual([
      {
        method: 'GET',
        url: `http://127.0.0.1/rpc/planet/find?input=${encodeURIComponent('{"id":1}')}`,
        protocol: null,
        cacheControl: 'public, max-age=60',
      },
      {
        method: 'POST',
        url: 'http://127.0.0.1/rpc/planet/create',
        protocol: '1',
        cacheControl: null,
      },
      {
        method: 'GET',
        url: `http://127.0.0.1/rpc/planet/find?input=${encodeURIComponent('{"id":99}')}`,
        protocol: null,
        cacheControl: 'no-store',
      },
    ])
  })

  it('refuses GET for procedures that did not opt in', async () => {
    const response = await worker.fetch(
      new Request(
        `http://127.0.0.1/rpc/planet/create?input=${encodeURIComponent('{"name":"Pluto"}')}`,
      ),
    )
    expect(response.status).toBe(405)
    expect(runtime.hits.create).toBe(0)
  })

  it('answers a malformed ?input with BAD_REQUEST', async () => {
    const response = await worker.fetch(
      new Request('http://127.0.0.1/rpc/planet/find?input=%7B'),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'BAD_REQUEST' },
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('lets a per-call Cache-Control win and never stores Set-Cookie', () => {
    const bridge = new GetBridgePlugin(app, '/rpc')
    const cacheControl = (headers: HeadersInit) => {
      const request = bridge.onRequest({
        request: new Request('http://127.0.0.1/rpc/planet/find?input=%7B%7D'),
      })
      if (!request) {
        throw new Error('expected the bridge to rewrite the GET')
      }
      const response = bridge.onResponse({
        request,
        response: new Response('{}', { headers }),
      })
      return (response ?? new Response(null, { headers })).headers.get(
        'cache-control',
      )
    }
    expect(cacheControl({})).toBe('public, max-age=60')
    expect(cacheControl({ 'cache-control': 'private, max-age=5' })).toBe(
      'private, max-age=5',
    )
    expect(cacheControl({ 'set-cookie': 'session=1' })).toBe('no-store')
  })

  it('keeps long inputs and unlisted paths on POST', async () => {
    const interceptor = getInterceptor(['/rpc/planet/find'])
    const sent: string[] = []
    const next = async (request?: Request) => {
      sent.push(
        request ? `${request.method} ${new URL(request.url).search}` : 'POST',
      )
      return new Response(null)
    }
    const post = (path: string, input: unknown) =>
      new Request(`http://127.0.0.1/rpc/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input }),
      })
    await interceptor({ request: post('planet/find', { b: 1, a: 2 }), next })
    await interceptor({
      request: post('planet/find', { id: 1, pad: 'x'.repeat(GET_MAX_URL) }),
      next,
    })
    await interceptor({ request: post('planet/create', { name: 'x' }), next })
    expect(sent).toEqual([
      `GET ?input=${encodeURIComponent('{"a":2,"b":1}')}`,
      'POST',
      'POST',
    ])
  })

  it('runs the same CallPlugin list on createLocalClient', async () => {
    runtime.findDelayMs = 40
    const client = createLocalClient(app, {
      context: { requestId: 'local' },
      plugins: [new DedupePlugin({ key: readKey })],
    })
    const [a, b] = await Promise.all([
      client.planet.find({ id: 1 }),
      client.planet.find({ id: 1 }),
    ])
    expect(a).toEqual({ id: 1, name: 'Earth' })
    expect(b).toEqual({ id: 1, name: 'Earth' })
    expect(runtime.hits.find).toBe(1)
  })
})
