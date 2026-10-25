import { procedure, router } from '@ts-pf/contract'
import { z } from 'zod'
import { app2, type Ctx2, contract2 } from './fixture2.js'
import { all, bindTools, createMcpFactory, createToolkit } from './mcp2.js'

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false
const assert = <T extends true>() => {}

const tk = createToolkit(contract2).$context<Ctx2>()

// ---- 1. $-key guard -------------------------------------------------------------
const bad = router({ $admin: { x: procedure.output(z.string()) } })
// @ts-expect-error top-level $ key
createToolkit(bad)
const badDeep = router({ user: { $find: procedure.output(z.string()) } })
// @ts-expect-error nested $ key
createToolkit(badDeep)

// ---- 2. effect ---------------------------------------------------------------------
tk.user.find.effect('read')
// @ts-expect-error kind() is gone
tk.user.find.kind('read')
// @ts-expect-error unknown effect
tk.user.find.effect('readonly')

// ---- 5. join through call -------------------------------------------------------
const findUser = tk.user.find
  .effect('read')
  .inject({ tenantId: ({ context }) => context.tenantId })
  .output(z.object({ id: z.string(), name: z.string(), team: z.string() }), async (u, { call, context }) => {
    const team = await call.team.find({ tenantId: context.tenantId, id: u.teamId })
    return { id: u.id, name: `${u.firstName} ${u.lastName}`, team: team.name }
  })
// @ts-expect-error async mapper return still checked against the schema
tk.user.find.output(z.object({ team: z.string() }), async (u, { call }) => {
  const team = await call.team.find({ tenantId: '', id: u.teamId })
  return { team: team.id.length }
})

// ---- 3. hosts + toolset names ---------------------------------------------------------
const adminHost = tk.$host({ description: 'Admin ops', tools: all(tk.admin), split: 'effect' })
const teamHost = tk.$host({ description: 'Teams', tools: [all(tk.team)] })

const ts = tk.$toolset({
  tools: [{ find_user: findUser }, all(tk.user, { exclude: [tk.user.find] })],
  hosts: { admin: adminHost, team: teamHost },
})

tk.$toolset({
  // @ts-expect-error flat tool collides with generated host name (split host)
  tools: { get_admin_query_capabilities: findUser },
  hosts: { admin: adminHost },
})
tk.$toolset({
  // @ts-expect-error flat tool collides with generated host name (unsplit host)
  tools: [{ call_team_capability: findUser }],
  hosts: { team: teamHost },
})
tk.$host({
  description: 'x',
  // @ts-expect-error duplicate inner names within one host
  tools: [all(tk.admin), { admin_purge: findUser }],
})
tk.$toolset({
  hosts: {
    // @ts-expect-error the check is symmetric: both colliding hosts are flagged
    a: tk.$host({ description: 'x', tools: all(tk.team), split: 'effect' }),
    // @ts-expect-error host "a" (split) and host "a_query" (unsplit) both generate get_a_query_capabilities
    a_query: tk.$host({ description: 'y', tools: all(tk.internal) }),
  },
})

// ---- 3b/3c. coverage counts host paths; object form -------------------------------
tk.$coverage({ toolsets: [ts], exclude: [tk.legacy, tk.internal] })
// @ts-expect-error without the host, admin.* is uncovered
tk.$coverage({ toolsets: [tk.$toolset({ tools: all(tk.user) })], exclude: [tk.legacy, tk.internal, tk.team] })
// @ts-expect-error admin.flags missing (only admin.purge excluded)
tk.$coverage({ toolsets: [tk.$toolset({ tools: [all(tk.user), all(tk.team)] })], exclude: [tk.internal, tk.legacy, tk.admin.purge] })

// ---- 4. all() with effect filter + typed inject ---------------------------------------
const reads = all(tk.user, { effect: 'read' })
assert<Equal<keyof typeof reads, 'user_find' | 'user_search'>>()
const writes = all(tk.user, { effect: 'write' }) // unclassified → write
assert<Equal<keyof typeof writes, 'user_ping'>>()
const rw = all(tk.user, { effect: ['read', 'destructive'] })
assert<Equal<keyof typeof rw, 'user_find' | 'user_search' | 'user_remove'>>()

const injected = all(tk.user, { inject: { tenantId: ({ context }) => context.tenantId } })
assert<Equal<(typeof injected)['user_find']['~tool']['model'], Omit<{ tenantId: string; id: string }, 'tenantId'>>>()
assert<Equal<(typeof injected)['user_ping']['~tool']['model'], void>>() // no tenantId → untouched
injected.user_search.examples([{ q: 'bob' }])

// @ts-expect-error key not an input field of any procedure under the node
all(tk.user, { inject: { tenantID: ({ context }) => context.tenantId } })
// @ts-expect-error string does not fit legacy.report.tenantId (number)
all(tk, { inject: { tenantId: ({ context }) => context.tenantId } })
all(tk, { exclude: [tk.legacy], inject: { tenantId: ({ context }) => context.tenantId } }) // exclude/effect narrow the check
// tool-level .inject on an all() tool: key already removed → type error, so no silent overlap
// @ts-expect-error tenantId already injected by all()
injected.user_find.inject({ tenantId: () => 'x' })

// ---- 6. createMcpFactory -----------------------------------------------------------
createMcpFactory(app2, { name: 'x', version: '1', context: () => ({ tenantId: 't', tenantNo: 1 }) })
// @ts-expect-error wrong context
createMcpFactory(app2, { name: 'x', version: '1', context: () => ({ tenantId: 't' }) })
// @ts-expect-error context required for a branded app
createMcpFactory(app2, { name: 'x', version: '1' })
declare const plainTree: { user: { find: import('@ts-pf/server').ImplementedProcedure } }
createMcpFactory(plainTree, { name: 'x', version: '1' }) // unbranded: Ctx = unknown, context optional
createMcpFactory(plainTree, { name: 'x', version: '1', context: () => 42 })
const tools = bindTools(ts, { app: app2, context: () => ({ tenantId: 't', tenantNo: 1 }) })
createMcpFactory(tools, { name: 'x', version: '1', maxResultChars: 1000 })
// @ts-expect-error McpTools source takes no context
createMcpFactory(tools, { name: 'x', version: '1', context: () => ({}) })
