import { procedure, router } from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import { createImplementer } from '@ts-pf/server'
import { FetchHandler, type HandleResult } from '@ts-pf/server-http'
import type { APIContext, AstroGlobal } from 'astro'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import {
  createAstroHandler,
  createAstroLocalClient,
  withBase,
} from '../src/server.js'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string(), user: z.string() })),
  },
})

const impl = createImplementer(contract).$context<{ user: string }>()
const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input, context }) => ({
      id: input.id,
      name: 'Earth',
      user: context.user,
    })),
  },
})

const pingContract = router({
  ping: procedure.output(z.string()),
})
const pingImpl = createImplementer(pingContract)
const pingApp = pingImpl.router({
  ping: pingImpl.ping.handler(async () => 1 as never),
})

function findRequest(url: string, user = 'ada'): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-user': user,
    },
    body: JSON.stringify({ input: { id: 1 } }),
  })
}

describe('createAstroHandler', () => {
  const handler = new FetchHandler<{ user: string }>(app)

  it('returns procedure output for POST /rpc/planet/find', async () => {
    const route = createAstroHandler(handler, {
      prefix: '/rpc',
      context: { user: 'ada' },
    })
    const response = await route({
      request: findRequest('http://localhost/rpc/planet/find'),
    } as APIContext)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      output: { id: 1, name: 'Earth', user: 'ada' },
    })
  })

  it('passes the context factory return value to the handler', async () => {
    const route = createAstroHandler(handler, {
      prefix: '/rpc',
      context: (astro) => ({
        user: astro.request.headers.get('x-user') ?? '',
      }),
    })
    const response = await route({
      request: findRequest('http://localhost/rpc/planet/find', 'grace'),
    } as APIContext)
    expect(await response.json()).toEqual({
      ok: true,
      output: { id: 1, name: 'Earth', user: 'grace' },
    })
  })

  it('awaits an async context factory', async () => {
    const route = createAstroHandler(handler, {
      prefix: '/rpc',
      context: async (astro) => {
        await Promise.resolve()
        return { user: astro.request.headers.get('x-user') ?? '' }
      },
    })
    const response = await route({
      request: findRequest('http://localhost/rpc/planet/find', 'lin'),
    } as APIContext)
    expect(await response.json()).toEqual({
      ok: true,
      output: { id: 1, name: 'Earth', user: 'lin' },
    })
  })

  it('uses a static context value', async () => {
    const route = createAstroHandler(handler, {
      prefix: '/rpc',
      context: { user: 'static' },
    })
    const response = await route({
      request: findRequest('http://localhost/rpc/planet/find'),
    } as APIContext)
    expect(await response.json()).toEqual({
      ok: true,
      output: { id: 1, name: 'Earth', user: 'static' },
    })
  })

  it('returns 404 Not Found outside the prefix', async () => {
    const route = createAstroHandler(handler, {
      prefix: '/rpc',
      context: { user: 'ada' },
    })
    const response = await route({
      request: new Request('http://localhost/health'),
    } as APIContext)
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not Found')
  })

  it('returns FetchHandler 405 for a non-POST on a matched path', async () => {
    const route = createAstroHandler(handler, {
      prefix: '/rpc',
      context: { user: 'ada' },
    })
    const response = await route({
      request: new Request('http://localhost/rpc/planet/find', {
        method: 'GET',
      }),
    } as APIContext)
    expect(response.status).toBe(405)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'METHOD_NOT_ALLOWED' },
    })
  })

  it('matches a prefix joined with withBase', async () => {
    const route = createAstroHandler(handler, {
      prefix: withBase('/docs/', '/rpc'),
      context: { user: 'ada' },
    })
    const response = await route({
      request: findRequest('http://localhost/docs/rpc/planet/find'),
    } as APIContext)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      output: { id: 1, name: 'Earth', user: 'ada' },
    })
  })

  it('encodes a PFError thrown by the context factory', async () => {
    const route = createAstroHandler(new FetchHandler(app, { onError() {} }), {
      prefix: '/rpc',
      context: () => {
        throw new PFError({
          code: 'UNAUTHORIZED',
          message: 'Sign in',
          status: 401,
        })
      },
    })
    const response = await route({
      request: findRequest('http://localhost/rpc/planet/find'),
    } as APIContext)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Sign in' },
    })
  })

  it('encodes an unknown context factory throw as INTERNAL', async () => {
    const seen: unknown[] = []
    const route = createAstroHandler(
      new FetchHandler(app, {
        onError: (error) => {
          seen.push(error)
        },
      }),
      {
        prefix: '/rpc',
        context: async () => {
          throw new Error('session store down')
        },
      },
    )
    const response = await route({
      request: findRequest('http://localhost/rpc/planet/find'),
    } as APIContext)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: 'Internal server error' },
    })
    expect(seen).toHaveLength(1)
  })

  it('does not run the context factory for unmatched, 405, or 404 requests', async () => {
    let calls = 0
    const route = createAstroHandler(new FetchHandler(app, { onError() {} }), {
      prefix: '/rpc',
      context: () => {
        calls++
        return { user: 'ada' }
      },
    })
    const outside = await route({
      request: new Request('http://localhost/health'),
    } as APIContext)
    const wrongMethod = await route({
      request: new Request('http://localhost/rpc/planet/find'),
    } as APIContext)
    const unknown = await route({
      request: findRequest('http://localhost/rpc/planet/missing'),
    } as APIContext)
    const badBody = await route({
      request: new Request('http://localhost/rpc/planet/find', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    } as APIContext)
    expect([
      outside.status,
      wrongMethod.status,
      unknown.status,
      badBody.status,
    ]).toEqual([404, 405, 404, 400])
    expect(calls).toBe(0)
    await route({
      request: findRequest('http://localhost/rpc/planet/find'),
    } as APIContext)
    expect(calls).toBe(1)
  })

  it('returns the same Response object FetchHandler produced', async () => {
    const recording = new RecordingHandler(app)
    const request = findRequest('http://localhost/rpc/planet/find')
    const route = createAstroHandler(recording, {
      prefix: '/rpc',
      context: { user: 'ada' },
    })
    const response = await route({ request } as APIContext)
    expect(recording.seenRequest).toBe(request)
    expect(response).toBe(recording.seenResponse)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      output: { id: 1, name: 'Earth', user: 'ada' },
    })
  })
})

function contextFromAstro(astro: APIContext): { user: string } {
  return { user: new URL(astro.request.url).pathname }
}

describe('shared context function', () => {
  it('accepts one APIContext factory for the endpoint and the Astro global', () => {
    expectTypeOf(createAstroHandler).toBeCallableWith(
      new FetchHandler<{ user: string }>(app),
      { prefix: '/rpc', context: contextFromAstro },
    )
    expectTypeOf(createAstroLocalClient).toBeCallableWith(
      app,
      {} as AstroGlobal,
      contextFromAstro,
    )
  })
})

describe('createAstroLocalClient', () => {
  it('calls the procedure in-process with the resolved context', async () => {
    const caller = await createAstroLocalClient(
      app,
      { request: new Request('http://localhost/') },
      async () => ({ user: 'ada' }),
    )
    expect(await caller.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
      user: 'ada',
    })
  })

  it('rejects with the context factory throw', async () => {
    const refusal = new PFError({ code: 'FORBIDDEN', status: 403 })
    await expect(
      createAstroLocalClient(
        app,
        { request: new Request('http://localhost/') },
        () => {
          throw refusal
        },
      ),
    ).rejects.toBe(refusal)
  })

  it('forwards validation.output', async () => {
    const caller = await createAstroLocalClient(
      pingApp,
      { request: new Request('http://localhost/') },
      {},
      { validation: { output: true } },
    )
    await expect(caller.ping()).rejects.toMatchObject({ code: 'INTERNAL' })
  })

  it('works when plugins and interceptors are omitted', async () => {
    const caller = await createAstroLocalClient(
      app,
      { request: new Request('http://localhost/') },
      { user: 'ada' },
    )
    expect(await caller.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
      user: 'ada',
    })
  })
})

class RecordingHandler extends FetchHandler<{ user: string }> {
  seenRequest: Request | undefined
  seenResponse: Response | undefined

  override async handle(
    request: Request,
    opts: Parameters<FetchHandler<{ user: string }>['handle']>[1],
  ): Promise<HandleResult> {
    this.seenRequest = request
    const result = await super.handle(request, opts)
    if (result.matched) {
      this.seenResponse = result.response
    }
    return result
  }
}
