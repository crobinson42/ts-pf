import { procedure, router } from '@ts-pf/contract'
import { z } from 'zod'

export const contract = router({
  planet: {
    list: procedure.output(
      z.array(z.object({ id: z.number(), name: z.string() })),
    ),
    upload: procedure
      .input(z.object({ title: z.string(), photo: z.file() }))
      .output(
        z.object({ id: z.number(), title: z.string(), size: z.number() }),
      ),
    download: procedure.input(z.object({ id: z.number() })).output(z.file()),
  },
})
