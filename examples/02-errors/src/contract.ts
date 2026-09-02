import { procedure, router } from '@ts-pf/contract'
import { z } from 'zod'

export const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
    locked: procedure.output(z.string()),
  },
})
