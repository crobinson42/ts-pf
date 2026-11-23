import { procedure, router } from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import {
  createImplementer,
  createLocalClient,
  type ImplementedRouter,
  type MiddlewareFn,
} from '@ts-pf/server'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), owner: z.string() })),
    count: procedure.output(z.number()),
  },
  health: procedure.output(z.string()),
})

type User = { id: string }
type Ctx = { req: Request; user?: User }

const impl = createImplementer(contract).$context<Ctx>()

const requireUser = impl.middleware(async ({ context, next }) => {
  const user = context.user
  if (!user) throw new PFError({ code: 'UNAUTHORIZED' })
  return next({ context: { user } })
})
const withTenant = impl.middleware(async ({ next }) =>
  next({ context: { tenant: 'acme' } }),
)

describe('middleware narrows context', () => {
  it('impl.middleware infers the keys it adds', () => {
    expectTypeOf(requireUser).toEqualTypeOf<MiddlewareFn<Ctx, { user: User }>>()
  })

  it('a router-level use() narrows every handler below it', () => {
    const authed = impl.use(requireUser)
    authed.planet.find.handler(({ context, input }) => {
      expectTypeOf(context.user).toEqualTypeOf<User>()
      expectTypeOf(context.req).toEqualTypeOf<Request>()
      return { id: input.id, owner: context.user.id }
    })
  })

  it('chains: each use() adds to what the next one sees', () => {
    impl
      .use(requireUser)
      .use(async ({ context, next }) => {
        expectTypeOf(context.user).toEqualTypeOf<User>()
        return next()
      })
      .use(withTenant)
      .planet.count.handler(({ context }) => {
        expectTypeOf(context.tenant).toEqualTypeOf<string>()
        expectTypeOf(context.user).toEqualTypeOf<User>()
        return 1
      })
  })

  it('a procedure-level use() and useAfter() narrow its handler', () => {
    impl.planet.find
      .use(requireUser)
      .useAfter(async ({ input, next }) =>
        next({ context: { lookedUp: input.id } }),
      )
      .handler(({ context, input }) => {
        expectTypeOf(context.user).toEqualTypeOf<User>()
        expectTypeOf(context.lookedUp).toEqualTypeOf<number>()
        return { id: input.id, owner: context.user.id }
      })
  })

  it('a useAfter() on a primitive output can still add context', () => {
    impl.planet.count
      .useAfter(async ({ next }) => next({ context: { counted: true } }))
      .handler(({ context }) => {
        expectTypeOf(context.counted).toEqualTypeOf<boolean>()
        return 1
      })
  })

  it('a middleware that changes the output keeps its keys by spreading', () => {
    impl.planet.find
      .useAfter(async ({ next }) => {
        const result = await next({ context: { audited: true } })
        return { ...result, owner: 'redacted' }
      })
      .handler(({ context, input }) => {
        expectTypeOf(context.audited).toEqualTypeOf<boolean>()
        return { id: input.id, owner: 'x' }
      })
  })

  it('without use(), the handler sees the $context type unchanged', () => {
    impl.health.handler(({ context }) => {
      expectTypeOf(context).toEqualTypeOf<Ctx>()
      return 'ok'
    })
    impl
      .use(async ({ next }) => next())
      .health.handler(({ context }) => {
        expectTypeOf(context).toEqualTypeOf<Ctx>()
        return 'ok'
      })
  })

  it('only keys added on every path are typed', () => {
    impl
      .use(async ({ context, next }) =>
        context.user ? next({ context: { user: context.user } }) : next(),
      )
      .health.handler(({ context }) => {
        expectTypeOf(context.user).toEqualTypeOf<User | undefined>()
        return 'ok'
      })
  })

  it('an added key may narrow an existing key, not change its type', () => {
    impl.use(async ({ next }) =>
      // @ts-expect-error req is a Request
      next({ context: { req: 'replaced' } }),
    )
  })

  it('a standalone MiddlewareFn annotation carries its added keys', () => {
    const standalone: MiddlewareFn<Ctx, { role: 'admin' }> = async ({ next }) =>
      next({ context: { role: 'admin' as const } })
    impl.use(standalone).health.handler(({ context }) => {
      expectTypeOf(context.role).toEqualTypeOf<'admin'>()
      return 'ok'
    })
  })

  it('a middleware typed for a narrower context fits a wider level', () => {
    impl
      .use(requireUser)
      .use(withTenant)
      .use(requireUser)
      .health.handler(({ context }) => {
        expectTypeOf(context.user).toEqualTypeOf<User>()
        return 'ok'
      })
  })

  it('a middleware that relies on a key nobody added is rejected', () => {
    const needsUser: MiddlewareFn<{ user: User }> = async ({ next }) => next()
    // @ts-expect-error Ctx has `user?: User`; needsUser requires `user`
    impl.use(needsUser)
    impl.use(requireUser).use(needsUser)
  })
})

describe('narrowing keeps the $context brand', () => {
  const authed = impl.use(requireUser)
  const app = authed.router({
    planet: {
      find: authed.planet.find.handler(({ context, input }) => ({
        id: input.id,
        owner: context.user.id,
      })),
      count: impl.planet.count.handler(() => 1),
    },
    health: impl.health.handler(() => 'ok'),
  })

  it('the router is branded with $context, not the narrowed context', () => {
    expectTypeOf(app).toEqualTypeOf<ImplementedRouter<typeof contract, Ctx>>()
  })

  it('createLocalClient takes the $context type', () => {
    createLocalClient(app, { context: { req: new Request('http://x') } })
  })
})
