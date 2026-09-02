import { procedure, router } from '@ts-pf/contract'
import { stream } from '@ts-pf/stream'
import { z } from 'zod'

export const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
    chat: procedure
      .input(z.object({ prompt: z.string() }))
      .output(stream(z.object({ token: z.string() }))),
    ingest: procedure
      .input(stream(z.object({ chunk: z.number() })))
      .output(z.object({ count: z.number() })),
  },
})
