import { procedure, router } from '@ts-pf/contract'
import { z } from 'zod'

export const contract = router({
  planet: {
    list: procedure.output(
      z.array(z.object({ id: z.number(), name: z.string() })),
    ),
    // Side-effect free, same for every caller: safe to serve as a cached GET.
    find: procedure
      .meta({ http: { method: 'GET', cacheControl: 'public, max-age=60' } })
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
    create: procedure
      .input(z.object({ name: z.string() }))
      .output(z.object({ id: z.number(), name: z.string() })),
  },
})
