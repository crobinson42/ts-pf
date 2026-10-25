// Checked by `tsc --noEmit` (type-check); not run by Vitest.
import { type ContractClient, procedure, router } from '@ts-pf/contract'
import { docs } from '@ts-pf/docs'
import { createImplementer, type ImplementedProcedure } from '@ts-pf/server'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import {
  all,
  bindTools,
  createToolkit,
  type McpCallInfo,
} from '../src/index.js'
import { mcp } from '../src/meta.js'
import { createMcpFactory } from '../src/sdk.js'
import { app, type Ctx, contract } from './fixture.js'

const tk = createToolkit(contract).$context<Ctx>()
const ctx = (): Ctx => ({ tenantId: 't', tenantNo: 1 })

describe('createToolkit', () => {
  it('rejects contract keys starting with $ at any depth', () => {
    const top = router({ $admin: { x: procedure.output(z.string()) } })
    // @ts-expect-error top-level $ key
    createToolkit(top)
    const deep = router({ user: { $find: procedure.output(z.string()) } })
    // @ts-expect-error nested $ key
    createToolkit(deep)
  })

  it('keeps mcp() effect literal through .meta()', () => {
    const p = procedure.meta(mcp({ effect: 'read' }))
    expectTypeOf(p['~pf'].meta.mcp.effect).toEqualTypeOf<'read'>()
  })
})

describe('ToolBuilder', () => {
  it('takes an Effect literal; there is no .kind()', () => {
    tk.user.find.effect('read')
    // @ts-expect-error kind() does not exist
    tk.user.find.kind('read')
    // @ts-expect-error unknown effect
    tk.user.find.effect('readonly')
  })

  it('removes injected keys from the model input', () => {
    const t = tk.user.find.inject({
      tenantId: ({ context }) => context.tenantId,
    })
    expectTypeOf(t['~tool'].model).toEqualTypeOf<
      Omit<{ tenantId: string; id: string }, 'tenantId'>
    >()
    t.examples([{ id: 'u1' }])
    // @ts-expect-error tenantId is no longer a model field
    t.examples([{ id: 'u1', tenantId: 'x' }])
  })

  it('checks inject keys and values against the procedure input', () => {
    // @ts-expect-error typo: not an input key
    tk.user.find.inject({ tenantID: () => 'x' })
    // @ts-expect-error tenantId is a string
    tk.user.find.inject({ tenantId: () => 1 })
    // @ts-expect-error no object input
    tk.user.ping.inject({ x: () => 1 })
  })

  it('makes .inject and .input exclusive', () => {
    const mapped = tk.user.find.input(z.object({ id: z.string() }), (a, o) => ({
      tenantId: o.context.tenantId,
      id: a.id,
    }))
    expectTypeOf(mapped['~tool'].model).toEqualTypeOf<{ id: string }>()
    // @ts-expect-error .inject after .input
    mapped.inject({ id: () => 'x' })
    const injected = tk.user.find.inject({ tenantId: () => 't' })
    // @ts-expect-error .input after .inject
    injected.input(z.object({ id: z.string() }), (a) => a)
    // @ts-expect-error the input map must return the procedure input
    tk.user.find.input(z.object({ id: z.string() }), (a) => ({ id: a.id }))
  })

  it('types output mappers and joins through call', () => {
    tk.user.find
      .effect('read')
      .inject({ tenantId: ({ context }) => context.tenantId })
      .output(
        z.object({ id: z.string(), name: z.string(), team: z.string() }),
        async (u, { call, context }) => {
          expectTypeOf(u.teamId).toEqualTypeOf<string>()
          const team = await call.team.find({
            tenantId: context.tenantId,
            id: u.teamId,
          })
          return {
            id: u.id,
            name: `${u.firstName} ${u.lastName}`,
            team: team.name,
          }
        },
      )
    tk.user.find.output(
      z.object({ team: z.string() }),
      // @ts-expect-error async mapper return is checked against the schema
      async (u, { call }) => {
        const team = await call.team.find({ tenantId: '', id: u.teamId })
        return { team: team.id.length }
      },
    )
    tk.user.find.output((u) => u.firstName)
  })

  it('types .errors() data per declared code', () => {
    tk.user.find.errors({
      NOT_FOUND: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<{ id: string }>()
        return `No user ${data.id}`
      },
    })
    // @ts-expect-error not a declared code
    tk.user.find.errors({ FORBIDDEN: () => 'x' })
  })
})

describe('.visible() / .scopes()', () => {
  it('keep the builder type, so the tool still names and binds', () => {
    const when = (info: McpCallInfo) => info.authInfo !== undefined
    const find = tk.user.find.visible(when).scopes(['users:read'])
    expectTypeOf(find).toEqualTypeOf<typeof tk.user.find>()
    // @ts-expect-error a predicate gets McpCallInfo, not the context
    tk.user.find.visible((info: { tenantId: string }) => info.tenantId === '')
    // @ts-expect-error scopes are strings
    tk.user.find.scopes([1])
    const ts = tk.$toolset({
      tools: [
        all(tk.team, { visible: when, scopes: ['teams:read'] }),
        { user_find: find },
      ],
      hosts: {
        admin: tk.$host({
          description: 'Admin.',
          tools: all(tk.admin),
          visible: async () => true,
        }),
      },
    })
    bindTools(ts, { app, context: ctx })
  })
})

describe('all() tags and hidden (type level)', () => {
  const widened: string[] = ['people']
  const c = router({
    a: procedure.meta({ ...docs({ tags: ['people', 'x'] }) }),
    b: procedure.meta(docs({ tags: ['billing'] })),
    none: procedure.meta(docs({ description: 'untagged' })),
    wide: procedure.meta(docs({ tags: widened })),
    gone: procedure.meta(docs({ tags: ['people'], hidden: true })),
  })
  const t = createToolkit(c)

  it('keeps a literal tag match, drops a mismatch and untagged', () => {
    const people = all(t, { tags: ['people'] })
    expectTypeOf<keyof typeof people>().toEqualTypeOf<'a' | 'wide'>()
  })

  it('keeps widened string[] tags (unknown at the type level)', () => {
    const billing = all(t, { tags: ['billing'] })
    expectTypeOf<keyof typeof billing>().toEqualTypeOf<'b' | 'wide'>()
  })

  it('drops literal hidden: true with or without a filter', () => {
    const every = all(t)
    expectTypeOf<keyof typeof every>().toEqualTypeOf<
      'a' | 'b' | 'none' | 'wide'
    >()
  })

  it('a widened filter keeps everything not hidden', () => {
    const any = all(t, { tags: widened })
    expectTypeOf<keyof typeof any>().toEqualTypeOf<
      'a' | 'b' | 'none' | 'wide'
    >()
  })

  it('$coverage treats literal hidden as decided', () => {
    t.$coverage({ toolsets: [t.$toolset({ tools: all(t) })] })
  })
})

describe('all()', () => {
  it('filters by effect; unclassified counts as write', () => {
    const reads = all(tk.user, { effect: 'read' })
    expectTypeOf<keyof typeof reads>().toEqualTypeOf<
      'user_find' | 'user_search'
    >()
    const writes = all(tk.user, { effect: 'write' })
    // user_secret is docs({ hidden: true }): dropped at the type level too
    expectTypeOf<keyof typeof writes>().toEqualTypeOf<'user_ping'>()
    const rw = all(tk.user, { effect: ['read', 'destructive'] })
    expectTypeOf<keyof typeof rw>().toEqualTypeOf<
      'user_find' | 'user_search' | 'user_remove'
    >()
    const rest = all(tk.user, { exclude: [tk.user.find, tk.user.secret] })
    expectTypeOf<keyof typeof rest>().toEqualTypeOf<
      'user_search' | 'user_remove' | 'user_ping'
    >()
  })

  it('injects each key only where the input has it', () => {
    const injected = all(tk.user, {
      inject: { tenantId: ({ context }) => context.tenantId },
    })
    expectTypeOf(injected.user_find['~tool'].model).toEqualTypeOf<
      Omit<{ tenantId: string; id: string }, 'tenantId'>
    >()
    expectTypeOf(injected.user_ping['~tool'].model).toEqualTypeOf<void>()
    injected.user_search.examples([{ q: 'bob' }])
    // @ts-expect-error tenantId already injected by all(): no silent overlap
    injected.user_find.inject({ tenantId: () => 'x' })
  })

  it('names bad inject keys and conflicting fields', () => {
    all(tk.user, {
      // @ts-expect-error "tenantID" is not an input field of any selected procedure
      inject: { tenantID: ({ context }) => context.tenantId },
    })
    all(tk, {
      // @ts-expect-error Injected "tenantId" does not fit field legacy.report.tenantId
      inject: { tenantId: ({ context }) => context.tenantId },
    })
    all(tk, {
      exclude: [tk.legacy],
      inject: { tenantId: ({ context }) => context.tenantId },
    })
  })
})

describe('$host / $toolset names', () => {
  const findUser = tk.user.find.inject({ tenantId: () => 't' })
  const adminHost = tk.$host({ description: 'Admin', tools: all(tk.admin) })
  const teamHost = tk.$host({
    description: 'Teams',
    tools: [all(tk.team)],
    split: false,
  })

  it('accepts distinct names', () => {
    tk.$toolset({
      tools: [
        { find_user: findUser },
        all(tk.user, { exclude: [tk.user.find] }),
      ],
      hosts: { admin: adminHost, team: teamHost },
    })
  })

  it('rejects flat tools that collide with generated host names', () => {
    tk.$toolset({
      // @ts-expect-error collides with the split host's get_admin_query_capabilities
      tools: { get_admin_query_capabilities: findUser },
      hosts: { admin: adminHost },
    })
    tk.$toolset({
      // @ts-expect-error collides with the unsplit host's call_team_capability
      tools: [{ call_team_capability: findUser }],
      hosts: { team: teamHost },
    })
  })

  it('rejects duplicate names within a host or toolset', () => {
    tk.$host({
      description: 'x',
      // @ts-expect-error duplicate admin_purge
      tools: [all(tk.admin), { admin_purge: findUser }],
    })
    tk.$toolset({
      // @ts-expect-error duplicate user_find
      tools: [all(tk.user), { user_find: findUser }],
    })
  })

  it('flags both hosts when their generated names collide', () => {
    tk.$toolset({
      hosts: {
        // @ts-expect-error host "a" (split) generates get_a_query_capabilities
        a: tk.$host({ description: 'x', tools: all(tk.team) }),
        // @ts-expect-error host "a_query" (unsplit) generates it too
        a_query: tk.$host({
          description: 'y',
          tools: all(tk.internal),
          split: false,
        }),
      },
    })
  })
})

describe('$coverage', () => {
  const adminHost = tk.$host({ description: 'Admin', tools: all(tk.admin) })

  it('counts host paths and exclusions', () => {
    const ts = tk.$toolset({
      tools: [all(tk.user), all(tk.team)],
      hosts: { admin: adminHost },
    })
    tk.$coverage({ toolsets: [ts], exclude: [tk.legacy, tk.internal] })
  })

  it('names what is uncovered', () => {
    // @ts-expect-error admin.* is uncovered without the host
    tk.$coverage({
      toolsets: [tk.$toolset({ tools: all(tk.user) })],
      exclude: [tk.legacy, tk.internal, tk.team],
    })
    // @ts-expect-error admin.flags is uncovered (only admin.purge excluded)
    tk.$coverage({
      toolsets: [tk.$toolset({ tools: [all(tk.user), all(tk.team)] })],
      exclude: [tk.internal, tk.legacy, tk.admin.purge],
    })
  })

  it('does not count composite tools', () => {
    const onboard = tk.$tool({
      description: 'Invite and add to team',
      effect: 'write',
      input: z.object({ email: z.string() }),
      run: async ({ input, call, context }) => {
        expectTypeOf(input).toEqualTypeOf<{ email: string }>()
        await call.team.find({ tenantId: context.tenantId, id: 't1' })
        return 'ok'
      },
    })
    // @ts-expect-error a composite covers no procedure, even under its name
    tk.$coverage({
      toolsets: [tk.$toolset({ tools: { internal_reindex: onboard } })],
      exclude: [tk.user, tk.team, tk.admin, tk.legacy],
    })
  })
})

describe('bindTools / createMcpFactory', () => {
  const ts = tk.$toolset({ tools: all(tk.user, { effect: 'read' }) })

  it('checks the app and context against the toolset', () => {
    const tools = bindTools(ts, { app, context: ctx })
    // @ts-expect-error wrong context
    bindTools(ts, { app, context: () => ({ tenantId: 't' }) })
    const other = router({ x: procedure.output(z.string()) })
    const otherImpl = createImplementer(other).$context<Ctx>()
    const otherApp = otherImpl.router({ x: otherImpl.x.handler(() => 'x') })
    // @ts-expect-error app of another contract
    bindTools(ts, { app: otherApp, context: ctx })
    createMcpFactory(tools, { name: 'x', version: '1' })
    // @ts-expect-error the McpTools form takes no context
    createMcpFactory(tools, { name: 'x', version: '1', context: ctx })
  })

  it('binds a typed client; context is required for a $context toolset', () => {
    const client = {} as ContractClient<typeof contract>
    bindTools(ts, { client, context: ctx })
    bindTools(ts, { client: () => client, context: ctx })
    // @ts-expect-error context required: mappers and inject see Ctx
    bindTools(ts, { client })
    const loose = createToolkit(contract)
    bindTools(loose.$toolset({ tools: all(loose.user) }), { client })
    // only optional keys: context may be omitted
    const optional = createToolkit(contract).$context<{ tenantId?: string }>()
    bindTools(optional.$toolset({ tools: all(optional.user) }), { client })
    // @ts-expect-error wrong context shape on the client form
    bindTools(ts, { client, context: () => ({ tenantId: 1 }) })
  })

  it('requires context for a branded app only', () => {
    createMcpFactory(app, { name: 'x', version: '1', context: ctx })
    // @ts-expect-error wrong context
    createMcpFactory(app, { name: 'x', version: '1', context: () => ({}) })
    // @ts-expect-error context required for a branded app
    createMcpFactory(app, { name: 'x', version: '1' })
    const plain = {} as { user: { find: ImplementedProcedure } }
    createMcpFactory(plain, { name: 'x', version: '1' })
    createMcpFactory(plain, { name: 'x', version: '1', context: () => 42 })
  })
})
