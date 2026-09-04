import { procedure, router } from '@ts-pf/contract'
import {
  applyPlugins,
  type CallInterceptor,
  type CallPlugin,
  createImplementer,
  createLocalClient,
  isImplementedProcedure,
  runProcedure,
} from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  ping: procedure.output(z.string()),
  echo: procedure
    .input(z.object({ n: z.number() }))
    .output(z.object({ n: z.number() })),
  raw: procedure.output(z.unknown()),
})

describe('call interceptors', () => {
  it('runs interceptors in onion order with [0] outermost', async () => {
    const order: string[] = []
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => {
        order.push('handler')
        return 'pong'
      }),
      echo: impl.echo.handler(async ({ input }) => input),
      raw: impl.raw.handler(async ({ input }) => input),
    })
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
    const client = createLocalClient(app, { context: {}, interceptors })
    expect(await client.ping()).toBe('pong')
    expect(order).toEqual(['in-0', 'in-1', 'handler', 'out-1', 'out-0'])
  })

  it('applies plugins before interceptors on createLocalClient', async () => {
    const order: string[] = []
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => {
        order.push('handler')
        return 'pong'
      }),
      echo: impl.echo.handler(async ({ input }) => input),
      raw: impl.raw.handler(async ({ input }) => input),
    })
    const plugin: CallPlugin = {
      name: 'plugin-a',
      intercept: async ({ next }) => {
        order.push('plugin')
        return next()
      },
    }
    const interceptor: CallInterceptor = async ({ next }) => {
      order.push('interceptor')
      return next()
    }
    expect(applyPlugins([plugin], [interceptor])).toEqual([
      plugin.intercept,
      interceptor,
    ])
    const client = createLocalClient(app, {
      context: {},
      plugins: [plugin],
      interceptors: [interceptor],
    })
    expect(await client.ping()).toBe('pong')
    expect(order).toEqual(['plugin', 'interceptor', 'handler'])
  })

  it('lets the next interceptor see next({ input }) and next({ signal })', async () => {
    const controller = new AbortController()
    let innerInput: unknown
    let innerSignal: AbortSignal | undefined
    let handlerInput: unknown
    let handlerSignal: AbortSignal | undefined
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input, signal }) => {
        handlerInput = input
        handlerSignal = signal
        return input
      }),
      raw: impl.raw.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, {
      context: {},
      interceptors: [
        async ({ next }) =>
          next({ input: { n: 99 }, signal: controller.signal }),
        async ({ input, signal, next }) => {
          innerInput = input
          innerSignal = signal
          return next()
        },
      ],
    })
    expect(await client.echo({ n: 1 })).toEqual({ n: 99 })
    expect(innerInput).toEqual({ n: 99 })
    expect(innerSignal).toBe(controller.signal)
    expect(handlerInput).toEqual({ n: 99 })
    expect(handlerSignal).toBe(controller.signal)
  })

  it('does not let interceptors mutate the procedure path', async () => {
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input, path }) => {
        expect(path).toEqual(['echo'])
        return input
      }),
      raw: impl.raw.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, {
      context: {},
      interceptors: [
        async ({ path, next }) => {
          path.push('mutated')
          return next()
        },
      ],
    })
    expect(await client.echo({ n: 1 })).toEqual({ n: 1 })
  })

  it('next({ input }) changes handler input', async () => {
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => input),
      raw: impl.raw.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, {
      context: {},
      interceptors: [async ({ next }) => next({ input: { n: 99 } })],
    })
    expect(await client.echo({ n: 1 })).toEqual({ n: 99 })
  })

  it('next({ context }) replaces context rather than merging', async () => {
    const impl = createImplementer(contract).$context<{
      a?: number
      b?: number
      c?: number
    }>()
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => input),
      raw: impl.raw.handler(async ({ context }) => context),
    })
    const client = createLocalClient(app, {
      context: { a: 1, b: 2 },
      interceptors: [async ({ next }) => next({ context: { c: 3 } })],
    })
    expect(await client.raw()).toEqual({ c: 3 })
  })

  it('can short-circuit without calling next', async () => {
    let called = false
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => {
        called = true
        return 'pong'
      }),
      echo: impl.echo.handler(async ({ input }) => input),
      raw: impl.raw.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, {
      context: {},
      interceptors: [async () => 'short'],
    })
    expect(await client.ping()).toBe('short')
    expect(called).toBe(false)
  })

  it('sees declared handler errors after finalizeDeclaredError', async () => {
    const c = router({
      find: procedure
        .input(z.object({ id: z.number() }))
        .output(z.object({ id: z.number() }))
        .errors({
          NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
        }),
    })
    const impl = createImplementer(c)
    const app = impl.router({
      find: impl.find.handler(async ({ errors, input }) => {
        throw errors.NOT_FOUND({ id: input.id })
      }),
    })
    let seen: unknown
    const client = createLocalClient(app, {
      context: {},
      interceptors: [
        async ({ next }) => {
          try {
            return await next()
          } catch (error) {
            seen = error
            throw error
          }
        },
      ],
    })
    await expect(client.find({ id: 9 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      data: { id: 9 },
    })
    expect(seen).toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      data: { id: 9 },
    })
  })

  it('sees INTERNAL when declared error data fails finalizeDeclaredError', async () => {
    const c = router({
      find: procedure
        .input(z.object({ id: z.number() }))
        .output(z.object({ id: z.number() }))
        .errors({
          NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
        }),
    })
    const impl = createImplementer(c)
    const app = impl.router({
      find: impl.find.handler(async ({ errors }) => {
        throw errors.NOT_FOUND({ id: 'nope' as never })
      }),
    })
    let seen: unknown
    const client = createLocalClient(app, {
      context: {},
      interceptors: [
        async ({ next }) => {
          try {
            return await next()
          } catch (error) {
            seen = error
            throw error
          }
        },
      ],
    })
    await expect(client.find({ id: 9 })).rejects.toMatchObject({
      code: 'INTERNAL',
    })
    expect(seen).toMatchObject({ code: 'INTERNAL' })
    expect((seen as { data?: unknown }).data).toBeUndefined()
  })

  it('sees VALIDATION from bad input', async () => {
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => input),
      raw: impl.raw.handler(async ({ input }) => input),
    })
    let seen: unknown
    const client = createLocalClient(app, {
      context: {},
      interceptors: [
        async ({ next }) => {
          try {
            return await next()
          } catch (error) {
            seen = error
            throw error
          }
        },
      ],
    })
    await expect(client.echo({ n: 'x' } as never)).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    expect(seen).toMatchObject({ code: 'VALIDATION' })
  })

  it('returns AsyncIterable output without consuming it', async () => {
    const c = router({
      chat: procedure,
    })
    const impl = createImplementer(c)
    let yields = 0
    const app = impl.router({
      chat: impl.chat.handler(async function* () {
        yields += 1
        yield 'a'
        yields += 1
        yield 'b'
      }),
    })
    let seen: unknown
    const client = createLocalClient(app, {
      context: {},
      interceptors: [
        async ({ next }) => {
          const output = await next()
          seen = output
          expect(
            typeof (output as { [Symbol.asyncIterator]?: unknown })[
              Symbol.asyncIterator
            ],
          ).toBe('function')
          expect(yields).toBe(0)
          return output
        },
      ],
    })
    const iter = (await client.chat()) as AsyncIterable<string>
    expect(seen).toBe(iter)
    const values: string[] = []
    for await (const value of iter) {
      values.push(value)
    }
    expect(values).toEqual(['a', 'b'])
    expect(yields).toBe(2)
  })

  it('exposes signal on interceptor ctx when the call passes one', async () => {
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => input),
      raw: impl.raw.handler(async ({ input }) => input),
    })
    const ac = new AbortController()
    let seen: AbortSignal | undefined
    const client = createLocalClient(app, {
      context: {},
      interceptors: [
        async ({ signal, next }) => {
          seen = signal
          return next()
        },
      ],
    })
    expect(await client.ping({ signal: ac.signal })).toBe('pong')
    expect(seen).toBe(ac.signal)
  })

  it('runs runProcedure without options', async () => {
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => input),
      raw: impl.raw.handler(async ({ input }) => input),
    })
    if (!isImplementedProcedure(app.ping)) {
      throw new Error('expected procedure')
    }
    expect(await runProcedure(app.ping, undefined, {})).toBe('pong')
  })
})
