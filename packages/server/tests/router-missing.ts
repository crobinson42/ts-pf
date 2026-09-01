import { procedure, router } from '@ts-pf/contract'
import { createImplementer } from '@ts-pf/server'
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
const impl = createImplementer(contract)

impl.router({
  // @ts-expect-error create is required by the contract
  planet: {
    find: impl.planet.find.handler(async ({ input }) => input),
  },
})
