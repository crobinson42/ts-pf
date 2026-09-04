import { procedure, router } from '@ts-pf/contract'
import { z } from 'zod'

const planet = z.object({ id: z.number(), name: z.string() })

export const contract = router({
  planet: {
    list: procedure.output(z.array(planet)),
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(planet)
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
    create: procedure.input(z.object({ name: z.string() })).output(planet),
  },
})
