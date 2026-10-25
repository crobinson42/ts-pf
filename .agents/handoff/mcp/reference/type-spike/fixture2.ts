import { procedure, router } from '@ts-pf/contract'
import { createImplementer } from '@ts-pf/server'
import { z } from 'zod'
import { mcp } from './mcp2.js'

const user = z.object({ id: z.string(), firstName: z.string(), lastName: z.string(), teamId: z.string() })

export const contract2 = router({
  user: {
    find: procedure
      .input(z.object({ tenantId: z.string(), id: z.string() }))
      .output(user)
      .errors({ NOT_FOUND: { status: 404, data: z.object({ id: z.string() }) } })
      .meta(mcp({ effect: 'read' })),
    search: procedure.input(z.object({ tenantId: z.string(), q: z.string() })).output(z.array(user)).meta(mcp({ effect: 'read' })),
    remove: procedure.input(z.object({ tenantId: z.string(), id: z.string() })).output(z.void()).meta(mcp({ effect: 'destructive' })),
    ping: procedure.output(z.string()), // no input, unclassified → 'write'
  },
  team: {
    find: procedure.input(z.object({ tenantId: z.string(), id: z.string() })).output(z.object({ id: z.string(), name: z.string() })),
  },
  admin: {
    purge: procedure.input(z.object({ tenantId: z.string() })).output(z.void()),
    flags: procedure.input(z.object({ tenantId: z.string(), flag: z.string() })).output(z.boolean()),
  },
  legacy: {
    // tenantId is a number here: a string inject must conflict
    report: procedure.input(z.object({ tenantId: z.number(), month: z.string() })).output(z.string()),
  },
  internal: {
    reindex: procedure.output(z.void()),
  },
})

export type Ctx2 = { tenantId: string; tenantNo: number }

const impl = createImplementer(contract2).$context<Ctx2>()
const u = { id: '', firstName: '', lastName: '', teamId: '' }
export const app2 = impl.router({
  user: {
    find: impl.user.find.handler(() => u),
    search: impl.user.search.handler(() => [u]),
    remove: impl.user.remove.handler(() => undefined),
    ping: impl.user.ping.handler(() => 'pong'),
  },
  team: { find: impl.team.find.handler(() => ({ id: '', name: '' })) },
  admin: { purge: impl.admin.purge.handler(() => undefined), flags: impl.admin.flags.handler(() => true) },
  legacy: { report: impl.legacy.report.handler(() => '') },
  internal: { reindex: impl.internal.reindex.handler(() => undefined) },
})
