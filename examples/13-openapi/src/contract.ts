import { procedure, router } from '@ts-pf/contract'
import { docs } from '@ts-pf/docs'
import { stream } from '@ts-pf/stream'
import Type from 'typebox'
import { z } from 'zod'

export const contract = router({
  planet: {
    list: procedure
      .meta(docs({ description: 'List planets' }))
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
      .input(Type.Object({ name: Type.String() }))
      .output(Type.Object({ id: Type.Number(), name: Type.String() })),
    chat: procedure
      .meta(docs({ description: 'Stream a planet briefing' }))
      .input(z.object({ prompt: z.string() }))
      .output(stream(z.object({ token: z.string() }))),
    hidden: procedure
      .meta(docs({ hidden: true, description: 'internal' }))
      .output(z.string()),
  },
})
