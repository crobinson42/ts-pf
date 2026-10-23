// Checked by `tsc --noEmit` (type-check); not run by Vitest.
import { type ContractClient, procedure, router } from '@ts-pf/contract'
import { createImplementer } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import type { APIContext } from 'astro'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { createAstroClient } from '../src/client.js'
import { createAstroHandler, createAstroLocalClient } from '../src/server.js'

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

declare const astro: APIContext

describe('createAstroHandler context', () => {
  it('is checked against the FetchHandler context inferred from the app', () => {
    const handler = new FetchHandler(app)
    createAstroHandler(handler, { prefix: '/rpc', context: { db: 'x' } })
    createAstroHandler(handler, {
      prefix: '/rpc',
      context: (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<APIContext>()
        return { db: 'x', user: ctx.url.host }
      },
    })
    // @ts-expect-error context must be AppCtx
    createAstroHandler(handler, { prefix: '/rpc', context: { wrong: 1 } })
    createAstroHandler(handler, {
      prefix: '/rpc',
      // @ts-expect-error the factory must return AppCtx
      context: () => ({ wrong: 1 }),
    })
  })
})

describe('createAstroLocalClient context', () => {
  it('is checked against $context<C>()', () => {
    createAstroLocalClient(app, astro, { db: 'x' })
    createAstroLocalClient(app, astro, async () => ({ db: 'x' }))
    // @ts-expect-error context must be AppCtx
    createAstroLocalClient(app, astro, { wrong: 1 })
    // @ts-expect-error the factory must return AppCtx
    createAstroLocalClient(app, astro, () => ({ wrong: 1 }))
  })

  it('returns the typed client', () => {
    expectTypeOf(
      createAstroLocalClient(app, astro, { db: 'x' }),
    ).resolves.toEqualTypeOf<ContractClient<typeof contract>>()
  })
})

describe('createAstroClient type argument', () => {
  it('returns the typed client with <typeof contract>', () => {
    const client = createAstroClient<typeof contract>({ prefix: '/rpc' })
    expectTypeOf(client).toEqualTypeOf<ContractClient<typeof contract>>()
  })

  it('surfaces a missing type argument at the call site', () => {
    const untyped = createAstroClient({ prefix: '/rpc' })
    expectTypeOf(untyped).toEqualTypeOf<{
      readonly '~error': 'Pass createAstroClient<typeof contract>({ prefix })'
    }>()
    // @ts-expect-error the untyped result has no procedures
    untyped.planet
    const annotated: ContractClient<typeof contract> = createAstroClient({
      prefix: '/rpc',
    })
    expectTypeOf(annotated.planet.find).parameter(0).toEqualTypeOf<{
      id: number
    }>()
  })
})
