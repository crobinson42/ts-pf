import { procedure, router } from '@ts-pf/contract'
import { catalog, type ProcedureCatalog } from '@ts-pf/docs'
import { stream } from '@ts-pf/stream'
import { z } from 'zod'

export const planetContract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
    list: procedure.output(
      z.array(z.object({ id: z.number(), name: z.string() })),
    ),
    chat: procedure
      .input(z.object({ prompt: z.string() }))
      .output(stream(z.object({ token: z.string() }))),
  },
})

export function planetCatalog(): ProcedureCatalog {
  return catalog(planetContract, { prefix: '/rpc' })
}
