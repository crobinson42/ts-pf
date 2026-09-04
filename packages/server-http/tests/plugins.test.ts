import { procedure, router } from '@ts-pf/contract'
import { createImplementer } from '@ts-pf/server'
import { FetchHandler, type HandlerPlugin } from '@ts-pf/server-http'
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

function rpc(method = 'POST', body = JSON.stringify({ input: { id: 1 } })) {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json', 'x-ts-pf-protocol': '1' },
  }
  if (method === 'POST') {
    init.body = body
  }
  return new Request('http://localhost/rpc/planet/find', init)
}

describe('HandlerPlugin lifecycle', () => {
  it('onRequest can short-circuit with a Response and still runs onResponse', async () => {
    const order: string[] = []
    const plugin: HandlerPlugin = {
      name: 'short',
      onRequest({ request }) {
        order.push(`req:${request.method}`)
        if (request.method === 'OPTIONS') {
          return new Response(null, { status: 204 })
        }
        return undefined
      },
      onResponse({ response }) {
        order.push(`res:${response.status}`)
        const headers = new Headers(response.headers)
        headers.set('x-plugin', '1')
        return new Response(response.body, { status: response.status, headers })
      },
    }
    const handler = new FetchHandler(app, { plugins: [plugin] })
    const result = await handler.handle(rpc('OPTIONS'), {
      prefix: '/rpc',
      context: {},
    })
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(204)
    expect(result.response.headers.get('x-plugin')).toBe('1')
    expect(order).toEqual(['req:OPTIONS', 'res:204'])
  })

  it('onResponse runs on 405 METHOD_NOT_ALLOWED', async () => {
    const plugin: HandlerPlugin = {
      name: 'headers',
      onResponse({ response }) {
        const headers = new Headers(response.headers)
        headers.set('x-plugin', '1')
        return new Response(response.body, { status: response.status, headers })
      },
    }
    const handler = new FetchHandler(app, { plugins: [plugin] })
    const result = await handler.handle(rpc('GET'), {
      prefix: '/rpc',
      context: {},
    })
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(405)
    expect(result.response.headers.get('x-plugin')).toBe('1')
  })

  it('onResponse runs on RPC errors', async () => {
    const plugin: HandlerPlugin = {
      name: 'headers',
      onResponse({ response }) {
        const headers = new Headers(response.headers)
        headers.set('x-plugin', '1')
        return new Response(response.body, { status: response.status, headers })
      },
    }
    const handler = new FetchHandler(app, { plugins: [plugin] })
    const result = await handler.handle(
      new Request('http://localhost/rpc/nope', {
        method: 'POST',
        body: '{}',
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(404)
    expect(result.response.headers.get('x-plugin')).toBe('1')
  })

  it('onError runs on RPC errors before onResponse', async () => {
    const order: string[] = []
    const plugin: HandlerPlugin = {
      name: 'err',
      onError({ error }) {
        order.push(`err:${error instanceof Error ? error.message : 'unknown'}`)
      },
      onResponse({ response }) {
        order.push(`res:${response.status}`)
        return undefined
      },
    }
    const handler = new FetchHandler(app, { plugins: [plugin] })
    const result = await handler.handle(
      new Request('http://localhost/rpc/nope', {
        method: 'POST',
        body: '{}',
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(404)
    expect(order).toEqual(['err:Procedure not found', 'res:404'])
  })

  it('onRequest can replace the Request before decode', async () => {
    const plugin: HandlerPlugin = {
      name: 'wrap',
      onRequest({ request }) {
        return new Request(request, {
          body: JSON.stringify({ input: { id: 7 } }),
          duplex: 'half',
        } as RequestInit & { duplex: 'half' })
      },
    }
    const handler = new FetchHandler(app, { plugins: [plugin] })
    const result = await handler.handle(
      rpc('POST', JSON.stringify({ input: { id: 1 } })),
      {
        prefix: '/rpc',
        context: {},
      },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(await result.response.json()).toEqual({
      ok: true,
      output: { id: 7, name: 'Earth' },
    })
  })

  it('onContext replaces context for the handler', async () => {
    const labeled = router({
      ping: procedure.output(z.string()),
    })
    const labeledImpl = createImplementer(labeled).$context<{ tag: string }>()
    const labeledApp = labeledImpl.router({
      ping: labeledImpl.ping.handler(async ({ context }) => context.tag),
    })
    const plugin: HandlerPlugin = {
      name: 'ctx',
      onContext({ context }) {
        return { ...(context as object), tag: 'from-plugin' }
      },
    }
    const handler = new FetchHandler(labeledApp, { plugins: [plugin] })
    const result = await handler.handle(
      new Request('http://localhost/rpc/ping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      { prefix: '/rpc', context: { tag: 'from-user' } },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(await result.response.json()).toEqual({
      ok: true,
      output: 'from-plugin',
    })
  })

  it('does not run plugins when the prefix does not match', async () => {
    let called = false
    const plugin: HandlerPlugin = {
      name: 'x',
      onRequest() {
        called = true
        return undefined
      },
    }
    const handler = new FetchHandler(app, { plugins: [plugin] })
    const result = await handler.handle(
      new Request('http://localhost/health'),
      {
        prefix: '/rpc',
        context: {},
      },
    )
    expect(result.matched).toBe(false)
    expect(called).toBe(false)
  })
})
