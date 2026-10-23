import {
  asResult,
  type CallInterceptor,
  type CallPlugin,
  type CallResult,
  createClient,
  intercept,
  type Link,
  RetryPlugin,
} from '@ts-pf/client'
import {
  type CallOptions,
  type ClientError,
  type ContractClient,
  procedure,
  router,
} from '@ts-pf/contract'
import type { PFError } from '@ts-pf/protocol'
import { describe, expectTypeOf, it } from 'vitest'
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
        GONE: { status: 410 },
      }),
  },
})

type FindErrors = (typeof contract.planet.find)['~pf']['errors']
type FindError = ClientError<FindErrors>
type ProtocolCode =
  | 'BAD_REQUEST'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'INTERNAL'
  | 'METHOD_NOT_ALLOWED'
  | 'PAYLOAD_TOO_LARGE'

declare const link: Link
declare const signal: AbortSignal
const client = createClient<typeof contract>(link)

describe('createClient call signatures', () => {
  it('returns ContractClient<T>', () => {
    expectTypeOf(client).toEqualTypeOf<ContractClient<typeof contract>>()
  })

  it('accepts input and CallOptions', () => {
    expectTypeOf(client.planet.find).parameters.toEqualTypeOf<
      [{ id: number }, CallOptions?]
    >()
    expectTypeOf(client.planet.list).parameters.toEqualTypeOf<[CallOptions?]>()
    expectTypeOf(client.planet.find({ id: 1 })).resolves.toEqualTypeOf<{
      id: number
      name: string
    }>()
    expectTypeOf(
      client.planet.find({ id: 1 }, { signal }),
    ).resolves.toEqualTypeOf<{ id: number; name: string }>()
    expectTypeOf(client.planet.list()).resolves.toEqualTypeOf<
      { id: number; name: string }[]
    >()
    expectTypeOf(client.planet.list({ signal })).resolves.toEqualTypeOf<
      { id: number; name: string }[]
    >()
    expectTypeOf(client.planet.list({})).resolves.toEqualTypeOf<
      { id: number; name: string }[]
    >()
  })

  it('rejects the wrong input and unknown options', () => {
    // @ts-expect-error id must be a number
    client.planet.find({ id: '1' })
    // @ts-expect-error input is required
    client.planet.find()
    // @ts-expect-error input is required even with options
    client.planet.find({ signal })
    // @ts-expect-error CallOptions is { signal } only
    client.planet.find({ id: 1 }, { timeout: 1000 })
    // @ts-expect-error signal must be an AbortSignal
    client.planet.find({ id: 1 }, { signal: 'abort' })
    // @ts-expect-error a no-input procedure takes CallOptions only
    client.planet.list({ id: 1 })
    // @ts-expect-error unknown procedure
    client.planet.destroy({ id: 1 })
    // @ts-expect-error unknown router
    client.moon
  })
})

describe('createClient options', () => {
  const interceptor: CallInterceptor = ({ path, input, signal, next }) => {
    expectTypeOf(path).toEqualTypeOf<string[]>()
    expectTypeOf(input).toBeUnknown()
    expectTypeOf(signal).toEqualTypeOf<AbortSignal | undefined>()
    return signal ? next({ input, signal }) : next({ input })
  }
  const plugin: CallPlugin = { name: 'noop', intercept: interceptor }

  it('accepts interceptors and plugins', () => {
    createClient<typeof contract>(link, { interceptors: [interceptor] })
    createClient<typeof contract>(link, { plugins: [plugin] })
    createClient<typeof contract>(link, {
      plugins: [new RetryPlugin({ retries: 2 }), plugin],
      interceptors: [interceptor],
    })
    expectTypeOf(intercept(link, { plugins: [plugin] })).toEqualTypeOf<Link>()
    expectTypeOf(intercept(link)).toEqualTypeOf<Link>()
  })

  it('rejects malformed options', () => {
    // @ts-expect-error unknown option
    createClient<typeof contract>(link, { retries: 3 })
    // @ts-expect-error plugins need a name and an intercept
    createClient<typeof contract>(link, { plugins: [{ name: 'x' }] })
    // @ts-expect-error an interceptor is not a plugin
    createClient<typeof contract>(link, { plugins: [interceptor] })
    // @ts-expect-error a plugin is not an interceptor
    createClient<typeof contract>(link, { interceptors: [plugin] })
    // @ts-expect-error the first argument must be a Link
    createClient<typeof contract>({})
  })

  it('next() may replace input and signal, not path', () => {
    const ok: CallInterceptor = ({ next }) => next({ input: { id: 2 } })
    expectTypeOf(ok).toEqualTypeOf<CallInterceptor>()
    const bad: CallInterceptor = ({ next }) =>
      // @ts-expect-error path is not replaceable
      next({ path: ['other'] })
    expectTypeOf(bad).toEqualTypeOf<CallInterceptor>()
  })
})

describe('asResult', () => {
  it('narrows ok / error and data from code', async () => {
    const result = await asResult(client.planet.find({ id: 1 }))
    expectTypeOf(result).toEqualTypeOf<
      CallResult<{ id: number; name: string }, FindError>
    >()
    if (result.ok) {
      expectTypeOf(result.data).toEqualTypeOf<{ id: number; name: string }>()
      expectTypeOf(result.error).toEqualTypeOf<undefined>()
    } else {
      expectTypeOf(result.data).toEqualTypeOf<undefined>()
      expectTypeOf(result.error).toEqualTypeOf<FindError>()
      if (result.error.code === 'NOT_FOUND') {
        expectTypeOf(result.error.data).toEqualTypeOf<{ id: number }>()
      } else if (result.error.code === 'GONE') {
        expectTypeOf(result.error.data).toEqualTypeOf<undefined>()
      } else if (result.error.code === 'VALIDATION') {
        expectTypeOf(result.error.data).toEqualTypeOf<{
          issues: { message: string; path: Array<string | number> }[]
        }>()
      }
    }
  })

  it('keeps the error union closed: declared variants plus protocol codes', async () => {
    const result = await asResult(client.planet.find({ id: 1 }))
    type E = NonNullable<Extract<typeof result, { ok: false }>['error']>
    expectTypeOf<E['code']>().toEqualTypeOf<
      'NOT_FOUND' | 'GONE' | ProtocolCode
    >()
    // Not widened to CallResult<T, E | PFError>.
    expectTypeOf<PFError>().not.toExtend<E>()
    expectTypeOf<E>().not.toEqualTypeOf<FindError | PFError>()
    if (!result.ok) {
      // @ts-expect-error TEAPOT is not a declared or protocol code
      result.error.code === 'TEAPOT'
    }
  })

  it('types error.status as optional', async () => {
    const result = await asResult(client.planet.find({ id: 1 }))
    if (!result.ok) {
      expectTypeOf(result.error.status).toEqualTypeOf<number | undefined>()
      // @ts-expect-error status may be undefined; guard or default it
      result.error.status.toFixed()
    }
  })

  it('has only protocol codes for a procedure without .errors()', async () => {
    const result = await asResult(client.planet.list())
    if (!result.ok) {
      expectTypeOf(result.error.code).toEqualTypeOf<ProtocolCode>()
    }
  })

  it('defaults E to PFError for an untyped promise', async () => {
    const result = await asResult(Promise.resolve(1))
    expectTypeOf(result).toEqualTypeOf<CallResult<number, PFError>>()
  })
})
