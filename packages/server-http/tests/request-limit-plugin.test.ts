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
})
