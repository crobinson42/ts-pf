import { procedure, router } from '@ts-pf/contract'
import { createImplementer, createLocalClient } from '@ts-pf/server'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  ping: procedure.output(z.string()),
  echo: procedure
    .input(z.object({ n: z.number() }))
    .output(z.object({ n: z.number() })),
})

describe('createImplementer', () => {
  it('createImplementer().router type-checks and runs a handler', async () => {
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, { context: {} })
    expect(await client.ping()).toBe('pong')
    expect(await client.echo({ n: 1 })).toEqual({ n: 1 })
  })

  it('a handler from a narrowed level gets the context its middleware added', async () => {
    const impl = createImplementer(contract).$context<{ token: string }>()
    const authed = impl.use(async ({ context, next }) =>
      next({ context: { user: `user-of-${context.token}` } }),
    )
    // Mixed: one handler from `authed`, one from `impl`, in one impl.router().
    const app = impl.router({
      ping: authed.ping.handler(async ({ context }) => context.user),
      echo: impl.echo.handler(async ({ input, context }) => {
        expect('user' in context).toBe(false)
        return input
      }),
    })
    const client = createLocalClient(app, { context: { token: 't1' } })
    expect(await client.ping()).toBe('user-of-t1')
    expect(await client.echo({ n: 1 })).toEqual({ n: 1 })
  })

  it('a level runs its middleware once for handlers built from it', async () => {
    const calls: string[] = []
    const impl = createImplementer(contract)
    const authed = impl.use(async ({ next }) => {
      calls.push('auth')
      return next({ context: { user: 'u1' } })
    })
    const app = authed.router({
      ping: authed.ping.handler(async ({ context }) => context.user),
      echo: impl.echo.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, { context: {} })
    expect(await client.ping()).toBe('u1')
    expect(calls).toEqual(['auth'])
    // A handler from `impl` gets the level's middleware from router().
    await client.echo({ n: 1 })
    expect(calls).toEqual(['auth', 'auth'])
  })

  it('types handler signal as an optional AbortSignal', () => {
    const impl = createImplementer(contract)
    impl.ping.handler(async ({ signal }) => {
      expectTypeOf(signal).toEqualTypeOf<AbortSignal | undefined>()
      return 'pong'
    })
  })

  it('throws PFError VALIDATION on bad input', async () => {
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, { context: {} })
    await expect(client.echo({ n: 'x' } as never)).rejects.toMatchObject({
      code: 'VALIDATION',
      status: undefined,
    })
  })

  it('errors.NOT_FOUND throws typed PFError', async () => {
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
    const client = createLocalClient(app, { context: {} })
    await expect(client.find({ id: 9 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      data: { id: 9 },
    })
  })

  it('errors.NOT_FOUND requires declared data', () => {
    const c = router({
      find: procedure
        .input(z.object({ id: z.number() }))
        .output(z.object({ id: z.number() }))
        .errors({
          NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
          EMPTY: { status: 410 },
        }),
    })
    const impl = createImplementer(c)
    impl.find.handler(async ({ errors, input }) => {
      expectTypeOf(errors.NOT_FOUND).parameters.toEqualTypeOf<
        [{ id: number }]
      >()
      expectTypeOf(errors.EMPTY).parameters.toEqualTypeOf<[]>()
      throw errors.NOT_FOUND({ id: input.id })
    })
  })
})
