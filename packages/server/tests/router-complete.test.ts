import { procedure, router } from '@ts-pf/contract'
import { createImplementer } from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

describe('router completeness', () => {
  it('throws at runtime when a procedure is missing', () => {
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
    const impl = createImplementer(contract)
    expect(() =>
      impl.router({
        planet: {
          find: impl.planet.find.handler(async ({ input }) => input),
        } as never,
      }),
    ).toThrow(/Missing implementation/)
  })
})
