import { procedure, router } from '@ts-pf/contract'
import { docs } from '@ts-pf/docs'
import { mcp } from '@ts-pf/mcp/meta'
import { z } from 'zod'

const Planet = z.object({
  id: z.number(),
  name: z.string(),
  moons: z.number(),
  discoveredBy: z.string().nullable(),
})

// Every planet procedure is scoped by workspace; MCP injects it from the caller.
const scoped = <S extends z.ZodRawShape>(shape: S) =>
  z.object({ workspaceId: z.string(), ...shape })

export const contract = router({
  planet: {
    list: procedure
      .input(scoped({}))
      .output(z.array(Planet))
      .meta({
        ...docs({ description: 'List every planet in the workspace.' }),
        ...mcp({ effect: 'read' }),
      }),
    find: procedure
      .input(scoped({ id: z.number().int().min(1) }))
      .output(Planet)
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      })
      .meta({
        ...docs({ description: 'Get one planet by id.' }),
        ...mcp({ effect: 'read' }),
      }),
    rename: procedure
      .input(scoped({ id: z.number().int(), name: z.string().min(2) }))
      .output(Planet)
      .meta({
        ...docs({ description: 'Rename a planet.' }),
        ...mcp({ effect: 'write' }),
      }),
    remove: procedure
      .input(scoped({ id: z.number().int() }))
      .output(z.object({ removed: z.boolean() }))
      .meta({
        ...docs({ description: 'Delete a planet permanently.' }),
        ...mcp({ effect: 'destructive' }),
      }),
  },
  ops: {
    stats: procedure
      .input(scoped({}))
      .output(z.object({ planets: z.number(), moons: z.number() }))
      .meta({
        ...docs({ description: 'Totals for the workspace.' }),
        ...mcp({ effect: 'read' }),
      }),
  },
})
