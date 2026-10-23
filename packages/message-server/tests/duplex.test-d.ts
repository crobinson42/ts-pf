// Checked by `tsc --noEmit` (type-check); not run by Vitest.
import { procedure, router } from '@ts-pf/contract'
import type { Duplex } from '@ts-pf/message'
import { createImplementer, type ImplementedRouter } from '@ts-pf/server'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { DuplexHandler } from '../src/index.js'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
  },
})

type AppCtx = { db: string; user?: string }

const impl = createImplementer(contract).$context<AppCtx>()
const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input }) => ({
      id: input.id,
      name: 'earth',
    })),
  },
})

declare const duplex: Duplex

describe('DuplexHandler context inference', () => {
  it('infers TCtx from the router', () => {
    const handler = new DuplexHandler(app)
    expectTypeOf(handler).toEqualTypeOf<DuplexHandler<AppCtx>>()
    handler.bind(duplex, { context: { db: 'x' } })
    handler.bind(duplex, {
      context: (info) => {
        expectTypeOf(info.meta).toEqualTypeOf<unknown>()
        return { db: 'x' }
      },
    })
    handler.bind(duplex, { context: async () => ({ db: 'x', user: 'ada' }) })
    expectTypeOf(handler.bind(duplex, { context: { db: 'x' } })).toEqualTypeOf<{
      close(): void
    }>()
  })

  it('rejects a context that does not match $context<C>()', () => {
    const handler = new DuplexHandler(app)
    // @ts-expect-error context must be AppCtx
    handler.bind(duplex, { context: { wrong: 1 } })
    // @ts-expect-error the factory must return AppCtx
    handler.bind(duplex, { context: () => ({ wrong: 1 }) })
  })

  it('still accepts an explicit generic that satisfies the router', () => {
    new DuplexHandler<AppCtx>(app)
    // @ts-expect-error { user } does not provide db
    new DuplexHandler<{ user: string }>(app)
  })

  it('falls back to unknown for an unbranded router', () => {
    const annotated: ImplementedRouter = app
    const handler = new DuplexHandler(annotated)
    expectTypeOf(handler).toEqualTypeOf<DuplexHandler<unknown>>()
    handler.bind(duplex, { context: { anything: true } })
  })
})
