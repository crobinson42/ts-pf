import {
  asResult,
  createClient,
  FetchLink,
  isLocalFailure,
} from '@ts-pf/client'
import { procedure, router } from '@ts-pf/contract'
import { isPFError, JSONCodec, PFError } from '@ts-pf/protocol'
import { createImplementer, FetchHandler } from '@ts-pf/server'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  planet: {
    list: procedure.output(
      z.array(z.object({ id: z.number(), name: z.string() })),
    ),
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
  },
})

const impl = createImplementer(contract)
const app = impl.router({
  planet: {
    list: impl.planet.list.handler(async () => [{ id: 1, name: 'Earth' }]),
    find: impl.planet.find.handler(async ({ input, errors }) => {
      if (input.id < 0) {
        throw errors.NOT_FOUND({ id: input.id })
      }
      return { id: input.id, name: 'Earth' }
    }),
  },
})

const handler = new FetchHandler(app)

const fetchImpl: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init)
  const result = await handler.handle(req, { prefix: '/rpc', context: {} })
  if (!result.matched) {
    return new Response('not found', { status: 404 })
  }
  return result.response
}

describe('createClient', () => {
  const client = createClient<typeof contract>(
    new FetchLink({ url: 'http://localhost/rpc', fetch: fetchImpl }),
  )

  it('calls a procedure over Fetch', async () => {
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
  })

  it('calls a no-input procedure', async () => {
    expect(await client.planet.list()).toEqual([{ id: 1, name: 'Earth' }])
  })

  it('passes AbortSignal on the request', async () => {
    const controller = new AbortController()
    let seen: AbortSignal | undefined
    const withSignal = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          seen = req.signal
          return fetchImpl(req)
        },
      }),
    )
    await withSignal.planet.find({ id: 1 }, { signal: controller.signal })
    expect(seen).toBeDefined()
    controller.abort()
    expect(seen?.aborted).toBe(true)
  })

  it('rejects with PFError', async () => {
    await expect(client.planet.find({ id: -1 })).rejects.toSatisfy(isPFError)
  })

  it('rethrows PFError from decodeResponse', async () => {
    const inner = new JSONCodec()
    const clientWithCodec = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: fetchImpl,
        codec: {
          encodeRequest: (req) => inner.encodeRequest(req),
          decodeRequest: (source) => inner.decodeRequest(source),
          encodeSuccess: (output) => inner.encodeSuccess(output),
          encodeFailure: (error) => inner.encodeFailure(error),
          decodeResponse: async () => {
            throw new PFError({
              code: 'BAD_REQUEST',
              status: 400,
              message: 'malformed stream',
            })
          },
        },
      }),
    )
    await expect(clientWithCodec.planet.list()).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      status: 400,
      message: 'malformed stream',
    })
  })

  it('maps fetch throws to INTERNAL status 0 and keeps cause', async () => {
    const syscall = new Error('connect ECONNREFUSED 127.0.0.1:80')
    const fetchError = new TypeError('fetch failed')
    fetchError.cause = syscall
    const offline = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: async () => {
          throw fetchError
        },
      }),
    )
    await expect(offline.planet.list()).rejects.toSatisfy((error: unknown) => {
      expect(isLocalFailure(error)).toBe(true)
      if (!isLocalFailure(error)) {
        return false
      }
      expect(error.code).toBe('INTERNAL')
      expect(error.message).toBe('fetch failed')
      expect(error.cause).toBe(fetchError)
      return true
    })
  })

  it('maps abort to INTERNAL status 0 with message Request aborted', async () => {
    const abortError = new DOMException(
      'This operation was aborted.',
      'AbortError',
    )
    const ac = new AbortController()
    ac.abort()
    const aborted = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: async () => {
          throw abortError
        },
      }),
    )
    await expect(
      aborted.planet.list({ signal: ac.signal }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isLocalFailure(error)).toBe(true)
      if (!isLocalFailure(error)) {
        return false
      }
      expect(error.message).toBe('Request aborted')
      expect(error.cause).toBe(abortError)
      return true
    })
  })

  it('asResult() returns a result union', async () => {
    const result = await asResult(client.planet.find({ id: -1 }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND')
    }
  })

  it('asResult preserves ClientError narrowing', async () => {
    const result = await asResult(client.planet.find({ id: -1 }))
    expect(result.ok).toBe(false)
    if (!result.ok && result.error.code === 'NOT_FOUND') {
      expectTypeOf(result.error.data).toEqualTypeOf<{ id: number }>()
      expect(result.error.data).toEqual({ id: -1 })
    }
  })

  it('adds interceptor headers', async () => {
    const seen: string[] = []
    const clientWithHeader = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc/',
        fetch: async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          seen.push(req.headers.get('x-test') ?? '')
          return fetchImpl(req)
        },
        interceptors: [
          async ({ next, request }) => {
            request.headers.set('x-test', '1')
            return next(request)
          },
        ],
      }),
    )
    await clientWithHeader.planet.list()
    expect(seen).toEqual(['1'])
  })

  it('does not invoke fetch with FetchLink as this', async () => {
    const fetchImplBound: typeof fetch = async function (
      this: unknown,
      input,
      init,
    ) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError(
          "Failed to execute 'fetch' on 'Window': Illegal invocation",
        )
      }
      return fetchImpl(input, init)
    }
    const browserish = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: fetchImplBound,
      }),
    )
    await expect(browserish.planet.list()).resolves.toEqual([
      { id: 1, name: 'Earth' },
    ])
  })
})

describe('isLocalFailure', () => {
  it('is true only for PFError with status 0', () => {
    expect(isLocalFailure(new PFError({ code: 'INTERNAL', status: 0 }))).toBe(
      true,
    )
    expect(isLocalFailure(new PFError({ code: 'INTERNAL', status: 500 }))).toBe(
      false,
    )
    expect(
      isLocalFailure(new PFError({ code: 'NOT_FOUND', status: 404 })),
    ).toBe(false)
    expect(isLocalFailure(new Error('fetch failed'))).toBe(false)
  })

  it('narrows status to 0', () => {
    const error: unknown = new PFError({
      code: 'INTERNAL',
      status: 0,
      message: 'fetch failed',
    })
    if (isLocalFailure(error)) {
      expectTypeOf(error.status).toEqualTypeOf<0>()
      expectTypeOf(error.code).toEqualTypeOf<string>()
    }
  })
})
