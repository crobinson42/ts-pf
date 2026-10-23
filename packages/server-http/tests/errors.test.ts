import { procedure, router } from '@ts-pf/contract'
import { JSONCodec, type RpcBodySource } from '@ts-pf/http'
import { isPFError, PFError, type RpcRequest } from '@ts-pf/protocol'
import { createImplementer } from '@ts-pf/server'
import { FetchHandler, type HandlerPlugin } from '@ts-pf/server-http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
    crash: procedure.input(z.object({ id: z.number() })),
    ping: procedure.output(z.string()),
    teapot: procedure.errors({ TEAPOT: { message: 'short and stout' } }),
  },
})

const impl = createImplementer(contract)
const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input, errors }) => {
      if (input.id === 404) throw errors.NOT_FOUND({ id: input.id })
      return { id: input.id, name: 'Earth' }
    }),
    crash: impl.planet.crash.handler(async () => {
      throw new TypeError('db connection refused')
    }),
    ping: impl.planet.ping.handler(async () => 1 as never),
    teapot: impl.planet.teapot.handler(async ({ errors }) => {
      throw errors.TEAPOT()
    }),
  },
})

function post(path: string, body: string, method = 'POST'): Request {
  return new Request(`http://localhost/rpc/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'POST' ? body : null,
  })
}

async function call(handler: FetchHandler, request: Request) {
  const result = await handler.handle(request, {
    prefix: '/rpc',
    context: { tenant: 'acme' },
  })
  if (!result.matched) throw new Error('expected match')
  const json = (await result.response.json()) as {
    ok: boolean
    error?: { code: string; message: string; data?: unknown }
  }
  return { status: result.response.status, json }
}

describe('FetchHandler default error logging', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('logs an unknown throw with console.error and returns INTERNAL', async () => {
    const { status, json } = await call(
      new FetchHandler(app),
      post('planet/crash', '{"input":{"id":1}}'),
    )
    expect(status).toBe(500)
    expect(json).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: 'Internal server error' },
    })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const [message, error] = errorSpy.mock.calls[0] as [string, unknown]
    expect(message).toContain('Unhandled error in "planet/crash"')
    expect(error).toBeInstanceOf(TypeError)
    expect((error as Error).message).toBe('db connection refused')
  })

  it('does not log declared errors, VALIDATION, or NOT_FOUND', async () => {
    const handler = new FetchHandler(app)
    const declared = await call(
      handler,
      post('planet/find', '{"input":{"id":404}}'),
    )
    expect(declared.status).toBe(404)
    expect(declared.json.error?.code).toBe('NOT_FOUND')

    const validation = await call(handler, post('planet/find', '{"input":{}}'))
    expect(validation.status).toBe(422)
    expect(validation.json.error?.code).toBe('VALIDATION')

    const missing = await call(handler, post('planet/nope', '{}'))
    expect(missing.status).toBe(404)

    const notAllowed = await call(handler, post('planet/find', '', 'GET'))
    expect(notAllowed.status).toBe(405)

    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('maps a declared error without status to HTTP 400', async () => {
    const handler = new FetchHandler(app)
    const { status, json } = await call(handler, post('planet/teapot', '{}'))
    expect(status).toBe(400)
    expect(json.error?.code).toBe('TEAPOT')
    expect(json.error).not.toHaveProperty('status')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('logs an output schema failure as a possible INTERNAL cause', async () => {
    const { status, json } = await call(
      new FetchHandler(app, { validation: { output: true } }),
      post('planet/ping', '{}'),
    )
    expect(status).toBe(500)
    expect(json.error).toEqual({
      code: 'INTERNAL',
      message: 'Internal server error',
    })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const [message] = errorSpy.mock.calls[0] as [string, unknown]
    expect(message).toContain('INTERNAL error in "planet/ping"')
    expect(message).toContain('output schema failure')
  })

  it('does not mention output schemas when output validation is off', async () => {
    const pingContract = router({ ping: procedure })
    const pingImpl = createImplementer(pingContract)
    const pingApp = pingImpl.router({
      ping: pingImpl.ping.handler(async () => {
        throw new PFError({
          code: 'INTERNAL',
          message: 'Internal server error',
        })
      }),
    })
    await call(new FetchHandler(pingApp), post('ping', '{}'))
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const [message] = errorSpy.mock.calls[0] as [string, unknown]
    expect(message).toContain('INTERNAL error in "ping"')
    expect(message).not.toContain('output schema')
  })
})

describe('FetchHandler onError option', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('receives the original error and info, and replaces default logging', async () => {
    const seen: {
      error: unknown
      path: readonly string[]
      context: unknown
      url: string
    }[] = []
    const handler = new FetchHandler(app, {
      onError(error, info) {
        seen.push({
          error,
          path: info.path,
          context: info.context,
          url: info.request.url,
        })
      },
    })
    const { status, json } = await call(
      handler,
      post('planet/crash', '{"input":{"id":1}}'),
    )
    expect(status).toBe(500)
    expect(json.error?.code).toBe('INTERNAL')
    expect(seen).toHaveLength(1)
    expect(seen[0]?.error).toBeInstanceOf(TypeError)
    expect(seen[0]?.path).toEqual(['planet', 'crash'])
    expect(seen[0]?.context).toEqual({ tenant: 'acme' })
    expect(seen[0]?.url).toBe('http://localhost/rpc/planet/crash')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('is called for every error response, including declared and transport errors', async () => {
    const codes: string[] = []
    const handler = new FetchHandler(app, {
      onError(error) {
        codes.push(isPFError(error) ? error.code : 'unknown')
      },
    })
    await call(handler, post('planet/find', '{"input":{"id":404}}'))
    await call(handler, post('planet/find', '{"input":{}}'))
    await call(handler, post('planet/nope', '{}'))
    await call(handler, post('planet/find', '', 'GET'))
    await call(handler, post('planet/find', 'not json'))
    expect(codes).toEqual([
      'NOT_FOUND',
      'VALIDATION',
      'NOT_FOUND',
      'METHOD_NOT_ALLOWED',
      'BAD_REQUEST',
    ])
  })

  it('runs after HandlerPlugin.onError and cannot replace the response', async () => {
    const order: string[] = []
    const plugin: HandlerPlugin = {
      name: 'audit',
      onError() {
        order.push('plugin')
      },
    }
    const handler = new FetchHandler(app, {
      plugins: [plugin],
      onError: (() => {
        order.push('option')
        return new Response('nope', { status: 418 })
      }) as unknown as () => void,
    })
    const { status, json } = await call(
      handler,
      post('planet/crash', '{"input":{"id":1}}'),
    )
    expect(order).toEqual(['plugin', 'option'])
    expect(status).toBe(500)
    expect(json.error?.code).toBe('INTERNAL')
  })

  it('passes context: undefined when the error happens before the context factory', async () => {
    let seenContext: unknown = 'unset'
    const handler = new FetchHandler(app, {
      onError(_error, info) {
        seenContext = info.context
      },
    })
    await call(handler, post('planet/nope', '{}'))
    expect(seenContext).toBeUndefined()
  })
})

describe('FetchHandler request envelope', () => {
  it('rejects a JSON object body that is not wrapped in { input } with 400', async () => {
    const handler = new FetchHandler(app)
    const { status, json } = await call(
      handler,
      post('planet/find', '{"id":1}'),
    )
    expect(status).toBe(400)
    expect(json).toEqual({
      ok: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Request body must be {"input": ...}',
      },
    })
  })

  it('keeps {} and { input: null } as an undefined input', async () => {
    const handler = new FetchHandler(app)
    const empty = await call(handler, post('planet/find', '{}'))
    expect(empty.status).toBe(422)
    expect(empty.json.error?.code).toBe('VALIDATION')

    const pingHandler = new FetchHandler(app)
    const ping = await call(pingHandler, post('planet/ping', '{"input":null}'))
    expect(ping.status).toBe(200)
    const emptyPing = await call(pingHandler, post('planet/ping', ''))
    expect(emptyPing.status).toBe(200)
  })

  it('still accepts a wrapped body', async () => {
    const { status, json } = await call(
      new FetchHandler(app),
      post('planet/find', '{"input":{"id":1}}'),
    )
    expect(status).toBe(200)
    expect(json).toEqual({ ok: true, output: { id: 1, name: 'Earth' } })
  })
})

describe('FetchHandler envelope check through a wrapping codec', () => {
  // Mirrors MultipartCodec / StreamCodec: read the envelope text from a
  // multipart part (or a JSONL line) and delegate to the inner JSONCodec via
  // a fresh RpcBodySource, never through request.text(). `@ts-pf/file` and
  // `@ts-pf/stream` cannot be devDependencies here: both already depend on
  // `@ts-pf/server-http` for their own tests.
  class PartCodec extends JSONCodec {
    override async decodeRequest(source: RpcBodySource): Promise<RpcRequest> {
      const form = await source.formData()
      const part = form.get('rpc')
      const text = typeof part === 'string' ? part : ''
      return super.decodeRequest({
        contentType: 'application/json',
        text: async () => text,
        formData: async () => new FormData(),
        body: () => null,
      })
    }
  }

  function multipart(path: string, rpc: string): Request {
    const form = new FormData()
    form.set('rpc', rpc)
    return new Request(`http://localhost/rpc/${path}`, {
      method: 'POST',
      body: form,
    })
  }

  it('returns 400 for an envelope part with keys but no input', async () => {
    const handler = new FetchHandler(app, { codec: new PartCodec() })
    const { status, json } = await call(
      handler,
      multipart('planet/find', '{"id":1}'),
    )
    expect(status).toBe(400)
    expect(json.error).toEqual({
      code: 'BAD_REQUEST',
      message: 'Request body must be {"input": ...}',
    })
  })

  it('does not fire for {} or a wrapped envelope part', async () => {
    const handler = new FetchHandler(app, { codec: new PartCodec() })
    const empty = await call(handler, multipart('planet/find', '{}'))
    expect(empty.status).toBe(422)
    expect(empty.json.error?.code).toBe('VALIDATION')

    const ok = await call(
      handler,
      multipart('planet/find', '{"input":{"id":1}}'),
    )
    expect(ok.status).toBe(200)
  })
})

describe('FetchHandler onError failures', () => {
  it('rejects handle() when onError throws', async () => {
    const handler = new FetchHandler(app, {
      onError() {
        throw new Error('logger down')
      },
    })
    await expect(
      handler.handle(post('planet/crash', '{"input":{"id":1}}'), {
        prefix: '/rpc',
        context: {},
      }),
    ).rejects.toThrow('logger down')
  })
})
