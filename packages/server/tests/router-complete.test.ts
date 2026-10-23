import { procedure, router } from '@ts-pf/contract'
import { createImplementer } from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number() })),
    create: procedure
      .input(z.object({ name: z.string() }))
      .output(z.object({ id: z.number() })),
  },
})

describe('router completeness', () => {
  it('throws at runtime when a procedure is missing', () => {
    const impl = createImplementer(contract)
    expect(() =>
      impl.router({
        planet: {
          find: impl.planet.find.handler(async ({ input }) => input),
        } as never,
      }),
    ).toThrow('Missing implementation at "planet.create"')
  })

  it('throws at runtime when a router is missing', () => {
    const impl = createImplementer(contract)
    expect(() => impl.router({} as never)).toThrow(
      'Missing implementation at "planet"',
    )
  })

  it('throws at runtime on an extra root key', () => {
    const impl = createImplementer(contract)
    const find = impl.planet.find.handler(async ({ input }) => input)
    const create = impl.planet.create.handler(async () => ({ id: 1 }))
    expect(() =>
      impl.router({
        planet: { find, create },
        moon: { find },
      } as never),
    ).toThrow('Unexpected implementation key "moon"')
  })

  it('throws at runtime on a nested extra key', () => {
    const impl = createImplementer(contract)
    const find = impl.planet.find.handler(async ({ input }) => input)
    const create = impl.planet.create.handler(async () => ({ id: 1 }))
    expect(() =>
      impl.router({
        planet: { find, create, destroy: create },
      } as never),
    ).toThrow('Unexpected implementation key "planet.destroy"')
  })

  it('throws at runtime when a nested slice app has keys beyond its contract', () => {
    // The types reject this too (implement.test-d.ts); `as never` reaches the
    // runtime check, which is the backstop for untyped callers.
    const starContract = router({
      find: procedure
        .input(z.object({ id: z.number() }))
        .output(z.object({ id: z.number() })),
      create: procedure
        .input(z.object({ name: z.string() }))
        .output(z.object({ id: z.number() })),
      list: procedure.output(z.array(z.number())),
    })
    const starImpl = createImplementer(starContract)
    const starApp = starImpl.router({
      find: starImpl.find.handler(async ({ input }) => input),
      create: starImpl.create.handler(async () => ({ id: 1 })),
      list: starImpl.list.handler(async () => []),
    })
    const impl = createImplementer(contract)
    expect(() => impl.router({ planet: starApp } as never)).toThrow(
      'Unexpected implementation key "planet.list"',
    )
  })

  it('accepts a complete tree, including one it already built', () => {
    const impl = createImplementer(contract)
    const app = impl.router({
      planet: {
        find: impl.planet.find.handler(async ({ input }) => input),
        create: impl.planet.create.handler(async () => ({ id: 1 })),
      },
    })
    expect(Object.keys(app)).toEqual(['planet'])
    expect(() => impl.router(app)).not.toThrow()
  })
})
