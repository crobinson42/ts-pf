import { oc } from '@ts-pf/contract'
import { implement } from '@ts-pf/server'
import { z } from 'zod'

const contract = oc.router({
  planet: {
    find: oc
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number() })),
    create: oc
      .input(z.object({ name: z.string() }))
      .output(z.object({ id: z.number() })),
  },
})
const os = implement(contract)

os.router({
  // @ts-expect-error create is required by the contract
  planet: {
    find: os.planet.find.handler(async ({ input }) => input),
  },
})
