import { procedure, router } from '@ts-pf/contract'
import { docs } from '@ts-pf/docs'
import { createImplementer } from '@ts-pf/server'
import { z } from 'zod'
import { mcp } from '../src/meta.js'

const User = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  teamId: z.string(),
})

export const contract = router({
  user: {
    find: procedure
      .input(z.object({ tenantId: z.string(), id: z.string() }))
      .output(User)
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.string() }) },
      })
      .meta({
        ...docs({ description: 'Find a user by id' }),
        ...mcp({ effect: 'read' }),
      }),
    search: procedure
      .input(z.object({ tenantId: z.string(), q: z.string() }))
      .output(z.array(User))
      .meta({
        ...docs({ description: 'Search users by name', tags: ['people'] }),
        ...mcp({ effect: 'read', aliases: ['lookup', 'directory'] }),
      }),
    remove: procedure
      .input(z.object({ tenantId: z.string(), id: z.string() }))
      .output(z.void())
      .meta({
        ...docs({ description: 'Delete a user permanently' }),
        ...mcp({ effect: 'destructive' }),
      }),
    // no input, unclassified → 'write'
    ping: procedure.output(z.string()),
    secret: procedure
      .output(z.string())
      .meta(docs({ description: 'Internal', hidden: true })),
  },
  team: {
    find: procedure
      .input(z.object({ tenantId: z.string(), id: z.string() }))
      .output(z.object({ id: z.string(), name: z.string() }))
      .meta({
        ...docs({ summary: 'Find a team' }),
        ...mcp({ effect: 'read' }),
      }),
  },
  admin: {
    purge: procedure
      .input(z.object({ tenantId: z.string() }))
      .output(z.void())
      .meta({
        ...docs({ description: 'Purge tenant data' }),
        ...mcp({ effect: 'destructive' }),
      }),
    flags: procedure
      .input(z.object({ tenantId: z.string(), flag: z.string() }))
      .output(z.boolean())
      .meta(docs({ description: 'Read a feature flag' })),
  },
  legacy: {
    // tenantId is a number here: a string inject must conflict
    report: procedure
      .input(z.object({ tenantId: z.number(), month: z.string() }))
      .output(z.string()),
  },
  internal: {
    reindex: procedure.output(z.void()),
  },
})

export type Ctx = { tenantId: string; tenantNo: number }

export const users = new Map([
  ['u1', { id: 'u1', firstName: 'Ada', lastName: 'Lovelace', teamId: 't1' }],
])
export const calls: string[] = []

const impl = createImplementer(contract).$context<Ctx>()
export const app = impl.router({
  user: {
    find: impl.user.find.handler(({ input, context, errors }) => {
      calls.push(`user.find:${context.tenantId}:${input.tenantId}`)
      const user = users.get(input.id)
      if (!user) throw errors.NOT_FOUND({ id: input.id })
      return user
    }),
    search: impl.user.search.handler(({ input }) =>
      [...users.values()].filter((u) => u.firstName.includes(input.q)),
    ),
    remove: impl.user.remove.handler(({ input }) => {
      users.delete(input.id)
    }),
    ping: impl.user.ping.handler(() => 'pong'),
    secret: impl.user.secret.handler(() => 'hidden'),
  },
  team: {
    find: impl.team.find.handler(({ input }) => ({
      id: input.id,
      name: `Team ${input.id}`,
    })),
  },
  admin: {
    purge: impl.admin.purge.handler(() => undefined),
    flags: impl.admin.flags.handler(({ input }) => input.flag === 'on'),
  },
  legacy: { report: impl.legacy.report.handler(() => 'report') },
  internal: {
    reindex: impl.internal.reindex.handler(() => {
      throw new Error('disk on fire')
    }),
  },
})
