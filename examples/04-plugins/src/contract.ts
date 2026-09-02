import { procedure, router } from '@ts-pf/contract'
import { z } from 'zod'

const planet = z.object({ id: z.number(), name: z.string() })

export const contract = router({
  planet: {
    list: procedure.output(z.array(planet)),
    create: procedure.input(z.object({ name: z.string() })).output(planet),
  },
})
