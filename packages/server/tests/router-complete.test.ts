import { oc } from '@ts-pf/contract'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { implement } from '@ts-pf/server'

describe('router completeness', () => {
  it('throws at runtime when a procedure is missing', () => {
    const contract = oc.router({
      planet: {
        find: oc.input(z.object({ id: z.number() })).output(z.object({ id: z.number() })),
        create: oc.input(z.object({ name: z.string() })).output(z.object({ id: z.number() })),
      },
    })
    const os = implement(contract)
    expect(() =>
      os.router({
        planet: {
          find: os.planet.find.handler(async ({ input }) => input),
        } as never,
      }),
    ).toThrow(/Missing implementation/)
  })
})
