// Checked by `tsc --noEmit` (type-check); not run by Vitest.
import { procedure, router } from '@ts-pf/contract'
import { createImplementer, type ImplementedRouter } from '@ts-pf/server'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { FetchHandler } from '../src/index.js'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
  },
})

type AppCtx = { db: string; req: Request; user?: string }

const impl = createImplementer(contract).$context<AppCtx>()
const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input }) => ({
      id: input.id,
      name: 'earth',
    })),
  },
})

declare const request: Request

describe('FetchHandler context inference', () => {
  it('infers TCtx from the router', () => {
    const handler = new FetchHandler(app)
    expectTypeOf(handler).toEqualTypeOf<FetchHandler<AppCtx>>()
    handler.handle(request, {
      prefix: '/rpc',
      context: { db: 'x', req: request },
    })
    handler.handle(request, {
      prefix: '/rpc',
      context: (r) => {
        expectTypeOf(r).toEqualTypeOf<Request>()
        return { db: 'x', req: r }
      },
    })
    handler.handle(request, {
      prefix: '/rpc',
      context: async (r) => ({ db: 'x', req: r, user: 'ada' }),
    })
  })

  it('rejects a context that does not match $context<C>()', () => {
    const handler = new FetchHandler(app)
    // @ts-expect-error context must be AppCtx
    handler.handle(request, { prefix: '/rpc', context: { wrong: 1 } })
    // @ts-expect-error req is missing
    handler.handle(request, { prefix: '/rpc', context: { db: 'x' } })
    // @ts-expect-error the factory must return AppCtx
    handler.handle(request, { prefix: '/rpc', context: (r) => ({ req: r }) })
  })

  it('still accepts an explicit generic that satisfies the router', () => {
    const handler = new FetchHandler<AppCtx>(app)
    expectTypeOf(handler).toEqualTypeOf<FetchHandler<AppCtx>>()
    new FetchHandler<AppCtx & { extra: boolean }>(app)
    // @ts-expect-error { db } does not provide req
    new FetchHandler<{ db: string }>(app)
  })

  it('falls back to unknown for an unbranded router', () => {
    const annotated: ImplementedRouter = app
    const handler = new FetchHandler(annotated)
    expectTypeOf(handler).toEqualTypeOf<FetchHandler<unknown>>()
    handler.handle(request, { prefix: '/rpc', context: { anything: true } })
  })

  it('is object when $context() was not called', () => {
    const plain = createImplementer(contract)
    const plainApp = plain.router({
      planet: {
        find: plain.planet.find.handler(async ({ input }) => ({
          id: input.id,
          name: 'earth',
        })),
      },
    })
    const handler = new FetchHandler(plainApp)
    expectTypeOf(handler).toEqualTypeOf<FetchHandler<object>>()
    handler.handle(request, { prefix: '/rpc', context: {} })
  })
})
