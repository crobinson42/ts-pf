import { procedure, router } from '@ts-pf/contract'
import {
  type CallInterceptor,
  type CallPlugin,
  createImplementer,
} from '@ts-pf/server'
import {
  CORSPlugin,
  FetchHandler,
  type HandlerPlugin,
} from '@ts-pf/server-http'
import { describe, expect, expectTypeOf, it } from 'vitest'
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

describe('FetchHandler call interceptors', () => {
  it('runs interceptors after onContext on a successful POST', async () => {
    const seen: unknown[] = []
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
    const interceptor: CallInterceptor = async ({ context, next }) => {
      seen.push(context)
      return next()
    }
    const handler = new FetchHandler(labeledApp, {
      plugins: [plugin],
      interceptors: [interceptor],
    })
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
    expect(seen).toEqual([{ tag: 'from-plugin' }])
    expect(await result.response.json()).toEqual({
      ok: true,
      output: 'from-plugin',
    })
  })

  it('keeps interceptors off the plugins array', () => {
    expectTypeOf<HandlerPlugin>().not.toHaveProperty('intercept')
    expectTypeOf<CallPlugin>().toHaveProperty('intercept')
    type Options = NonNullable<ConstructorParameters<typeof FetchHandler>[1]>
    expectTypeOf<Options>().toHaveProperty('plugins')
    expectTypeOf<Options>().toHaveProperty('interceptors')
    expectTypeOf<Options['plugins']>().toEqualTypeOf<
      HandlerPlugin[] | undefined
    >()
    expectTypeOf<Options['interceptors']>().toEqualTypeOf<
      readonly CallInterceptor[] | undefined
    >()
  })

  it('does not run call interceptors on lookup NOT_FOUND; onError still runs', async () => {
    let interceptorRan = false
    let onErrorRan = false
    const plugin: HandlerPlugin = {
      name: 'err',
      onError() {
        onErrorRan = true
      },
    }
    const handler = new FetchHandler(app, {
      plugins: [plugin],
      interceptors: [
        async ({ next }) => {
          interceptorRan = true
          return next()
        },
      ],
    })
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
    expect(await result.response.json()).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(interceptorRan).toBe(false)
    expect(onErrorRan).toBe(true)
  })

  it('does not run call interceptors on METHOD_NOT_ALLOWED', async () => {
    let interceptorRan = false
    const handler = new FetchHandler(app, {
      interceptors: [
        async ({ next }) => {
          interceptorRan = true
          return next()
        },
      ],
    })
    const result = await handler.handle(rpc('GET'), {
      prefix: '/rpc',
      context: {},
    })
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(405)
    expect(interceptorRan).toBe(false)
  })

  it('does not run call interceptors on prefix miss', async () => {
    let interceptorRan = false
    const handler = new FetchHandler(app, {
      interceptors: [
        async ({ next }) => {
          interceptorRan = true
          return next()
        },
      ],
    })
    const result = await handler.handle(
      new Request('http://localhost/health'),
      {
        prefix: '/rpc',
        context: {},
      },
    )
    expect(result.matched).toBe(false)
    expect(interceptorRan).toBe(false)
  })

  it('runs interceptors when the handler throws a declared PFError', async () => {
    const order: string[] = []
    const failContract = router({
      boom: procedure.output(z.string()).errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
    })
    const failImpl = createImplementer(failContract)
    const failApp = failImpl.router({
      boom: failImpl.boom.handler(async ({ errors }) => {
        order.push('handler')
        throw errors.NOT_FOUND({ id: 1 })
      }),
    })
    const handler = new FetchHandler(failApp, {
      interceptors: [
        async ({ next }) => {
          order.push('in')
          try {
            return await next()
          } catch (error) {
            order.push('catch')
            throw error
          }
        },
      ],
    })
    const result = await handler.handle(
      new Request('http://localhost/rpc/boom', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(404)
    expect(await result.response.json()).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', data: { id: 1 } },
    })
    expect(order).toEqual(['in', 'handler', 'catch'])
  })

  it('runs interceptors in onion order with [0] outermost', async () => {
    const order: string[] = []
    const interceptors: CallInterceptor[] = [
      async ({ next }) => {
        order.push('in-0')
        const result = await next()
        order.push('out-0')
        return result
      },
      async ({ next }) => {
        order.push('in-1')
        const result = await next()
        order.push('out-1')
        return result
      },
    ]
    const tracked = impl.router({
      planet: {
        find: impl.planet.find.handler(async ({ input }) => {
          order.push('handler')
          return { id: input.id, name: 'Earth' }
        }),
      },
    })
    const handler = new FetchHandler(tracked, { interceptors })
    const result = await handler.handle(rpc(), {
      prefix: '/rpc',
      context: {},
    })
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(await result.response.json()).toEqual({
      ok: true,
      output: { id: 1, name: 'Earth' },
    })
    expect(order).toEqual(['in-0', 'in-1', 'handler', 'out-1', 'out-0'])
  })

  it('composes HTTP plugins with call interceptors', async () => {
    const order: string[] = []
    const plugin: HandlerPlugin = {
      name: 'headers',
      onResponse({ response }) {
        order.push(`res:${response.status}`)
        const headers = new Headers(response.headers)
        headers.set('x-plugin', '1')
        return new Response(response.body, { status: response.status, headers })
      },
    }
    const handler = new FetchHandler(app, {
      plugins: [new CORSPlugin(), plugin],
      interceptors: [
        async ({ next }) => {
          order.push('in')
          const result = await next()
          order.push('out')
          return result
        },
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
    expect(result.response.status).toBe(200)
    expect(result.response.headers.get('access-control-allow-origin')).toBe('*')
    expect(result.response.headers.get('x-plugin')).toBe('1')
    expect(order).toEqual(['in', 'out', 'res:200'])
  })
})
