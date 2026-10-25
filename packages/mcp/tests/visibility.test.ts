import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  all,
  bindTools,
  createToolkit,
  type McpCallInfo,
} from '../src/index.js'
import { app, type Ctx, contract } from './fixture.js'

const tk = createToolkit(contract).$context<Ctx>()
const ctx = (): Ctx => ({ tenantId: 't', tenantNo: 1 })
const tenant = { tenantId: ({ context }: { context: Ctx }) => context.tenantId }
const text = (r: { content: { text: string }[] }) => r.content[0]?.text ?? ''
const json = (r: { content: { text: string }[] }) => JSON.parse(text(r))

const isAdmin = (info: McpCallInfo) =>
  info.authInfo?.scopes.includes('admin') ?? false
const as = (...scopes: string[]): McpCallInfo => ({
  authInfo: { token: 't', clientId: 'c', scopes },
})
const user = as()
const admin = as('admin')
const names = async (
  tools: { list(info?: McpCallInfo): Promise<{ name: string }[]> },
  info: McpCallInfo,
) => (await tools.list(info)).map((d) => d.name)

describe('.visible() on flat tools', () => {
  const tools = bindTools(
    tk.$toolset({
      tools: {
        user_find: tk.user.find.inject(tenant),
        admin_purge: tk.admin.purge.inject(tenant).visible(isAdmin),
        ops_note: tk.$tool({
          description: 'Leave a note.',
          effect: 'write',
          input: z.object({ text: z.string() }),
          run: ({ input }) => `noted: ${input.text}`,
          visible: async (info) => isAdmin(info),
        }),
      },
    }),
    { app, context: ctx },
  )

  it('lists hidden tools only for callers who may see them', async () => {
    expect(await names(tools, user)).toEqual(['user_find'])
    expect(await names(tools, admin)).toEqual([
      'user_find',
      'admin_purge',
      'ops_note',
    ])
  })

  it('answers a call to a hidden tool like an unknown tool', async () => {
    expect(text(await tools.call('admin_purge', {}, user))).toBe(
      'Unknown tool "admin_purge"',
    )
    expect(text(await tools.call('ops_note', { text: 'x' }, admin))).toBe(
      'noted: x',
    )
  })

  it('applies all({ visible }) to every selected tool', async () => {
    const perNode = bindTools(
      tk.$toolset({
        tools: [
          { team_find: tk.team.find.inject(tenant) },
          all(tk.admin, { inject: tenant, visible: isAdmin }),
        ],
      }),
      { app, context: ctx },
    )
    expect(await names(perNode, user)).toEqual(['team_find'])
    expect(await names(perNode, admin)).toEqual([
      'team_find',
      'admin_purge',
      'admin_flags',
    ])
  })
})

describe('.visible() inside a host', () => {
  const build = (hostVisible?: (info: McpCallInfo) => boolean) =>
    bindTools(
      tk.$toolset({
        hosts: {
          users: tk.$host({
            description: 'User accounts.',
            tools: [
              all(tk.user, { exclude: [tk.user.remove], inject: tenant }),
              { user_remove: tk.user.remove.inject(tenant).visible(isAdmin) },
            ],
            ...(hostVisible ? { visible: hostVisible } : {}),
          }),
        },
      }),
      { app, context: ctx, onError: () => {} },
    )
  const tools = build()

  it('drops a bucket whose inner tools are all hidden', async () => {
    expect(await names(tools, user)).toEqual([
      'get_users_query_capabilities',
      'call_users_query_capability',
      'get_users_operations_capabilities',
      'call_users_operations_capability',
    ])
    const list = await tools.list(user)
    const ops = list.find((d) => d.name === 'call_users_operations_capability')
    // user_ping only: the destructive user_remove is not this caller's
    expect(ops?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
    })
    expect(ops?.inputSchema.properties).toMatchObject({
      name: { enum: ['user_ping'] },
    })
    const adminOps = (await tools.list(admin)).find(
      (d) => d.name === 'call_users_operations_capability',
    )
    expect(adminOps?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
    })
  })

  it('discovers and dispatches only what the caller may see', async () => {
    const found = json(
      await tools.call(
        'get_users_operations_capabilities',
        { names: ['user_ping', 'user_remove'] },
        user,
      ),
    )
    expect(found.total).toBe(1)
    expect(found.tools.map((t: { name: string }) => t.name)).toEqual([
      'user_ping',
    ])
    expect(found.unknown).toEqual(['user_remove'])
    const query = json(
      await tools.call(
        'get_users_operations_capabilities',
        { query: 'delete' },
        user,
      ),
    )
    expect(query.tools).toEqual([])
    expect(
      text(
        await tools.call(
          'call_users_operations_capability',
          { name: 'user_remove', input: { id: 'nobody' } },
          user,
        ),
      ),
    ).toBe('Unknown capability "user_remove". Valid: user_ping')
    expect(
      text(
        await tools.call(
          'call_users_operations_capability',
          { name: 'user_remove', input: { id: 'nobody' } },
          admin,
        ),
      ),
    ).toBe('OK')
  })

  it('hides the whole host with $host({ visible })', async () => {
    const gated = build(isAdmin)
    expect(await names(gated, user)).toEqual([])
    expect(
      text(await gated.call('get_users_query_capabilities', {}, user)),
    ).toBe('Unknown tool "get_users_query_capabilities"')
    expect(await names(gated, admin)).toHaveLength(4)
  })

  it('runs each predicate once per listing', async () => {
    const when = vi.fn(isAdmin)
    const once = bindTools(
      tk.$toolset({
        hosts: {
          admin: tk.$host({
            description: 'Admin.',
            tools: all(tk.admin, { inject: tenant, visible: when }),
            split: false,
          }),
        },
      }),
      { app, context: ctx },
    )
    await once.list(admin)
    expect(when).toHaveBeenCalledTimes(2) // admin_purge, admin_flags
  })
})

describe('listing without predicates', () => {
  it('returns the same definitions to every caller', async () => {
    const tools = bindTools(
      tk.$toolset({ tools: all(tk.user, { inject: tenant }) }),
      { app, context: ctx },
    )
    expect(await tools.list(user)).toEqual(await tools.list(admin))
  })
})
