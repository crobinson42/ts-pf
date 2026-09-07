import { procedure, router } from '@ts-pf/contract'
import { docs } from '@ts-pf/docs'
import { z } from 'zod'

export const contract = router({
  planet: {
    list: procedure
      .meta(docs({ description: 'List known planets' }))
      .output(z.array(z.object({ id: z.number(), name: z.string() }))),
    find: procedure
      .meta(docs({ description: 'Find a planet by id' }))
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
    create: procedure
      .meta(docs({ description: 'Create a planet' }))
      .input(z.object({ name: z.string() }))
      .output(z.object({ id: z.number(), name: z.string() })),
  },
})
