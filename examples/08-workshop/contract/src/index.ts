import { procedure, router } from '@ts-pf/contract'
import { stream } from '@ts-pf/stream'
import Type from 'typebox'
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
    create: procedure
      .input(Type.Object({ name: Type.String() }))
      .output(Type.Object({ id: Type.Number(), name: Type.String() })),
    describe: procedure
      .input(z.object({ id: z.number() }))
      .output(stream(z.object({ token: z.string() })))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
  },
})
