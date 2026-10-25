import { describe, expect, it } from 'vitest'
import { all, bindTools, createToolkit } from '../src/index.js'
import { app, type Ctx, contract } from './fixture.js'

const tk = createToolkit(contract).$context<Ctx>()
const ctx = (): Ctx => ({ tenantId: 't', tenantNo: 1 })
const tenant = { tenantId: ({ context }: { context: Ctx }) => context.tenantId }
const text = (r: { content: { text: string }[] }) => r.content[0]?.text ?? ''
const json = (r: { content: { text: string }[] }) => JSON.parse(text(r))

const split = bindTools(
  tk.$toolset({
    tools: { admin_flags: tk.admin.flags.inject(tenant) },
    hosts: {
      users: tk.$host({
        description: 'User accounts.',
        tools: [
          all(tk.user, { inject: tenant }),
          all(tk.team, { inject: tenant }),
        ],
      }),
    },
  }),
  { app, context: ctx, onError: () => {} },
)

describe('$host', () => {
  it('lists the pinned tool plus a get / call pair per non-empty bucket', async () => {
    const list = await split.list()
    expect(list.map((d) => [d.name, d.annotations])).toEqual([
      ['admin_flags', { readOnlyHint: false, destructiveHint: false }],
      ['get_users_query_capabilities', { readOnlyHint: true }],
      ['call_users_query_capability', { readOnlyHint: true }],
      ['get_users_operations_capabilities', { readOnlyHint: true }],
      [
        'call_users_operations_capability',
        { readOnlyHint: false, destructiveHint: true },
      ],
    ])
  })

  it('describes the catalog and enumerates names in call_*', async () => {
    const list = await split.list()
    const get = list.find((d) => d.name === 'get_users_query_capabilities')
    expect(get?.description).toBe(
      'User accounts.\nSearch these 3 read-only capabilities, then run one with call_users_query_capability. Capabilities: user_find, user_search, team_find.',
    )
    expect(get?.inputSchema).toMatchObject({
      properties: { category: { enum: ['team', 'user'] } },
    })
    const call = list.find((d) => d.name === 'call_users_operations_capability')
    expect(call?.inputSchema).toMatchObject({
      properties: { name: { enum: ['user_remove', 'user_ping'] } },
      required: ['name'],
    })
  })

  it('omits an empty bucket', async () => {
    const reads = bindTools(
      tk.$toolset({
        hosts: { r: tk.$host({ description: 'Reads', tools: all(tk.team) }) },
      }),
      { app, context: ctx },
    )
    expect((await reads.list()).map((d) => d.name)).toEqual([
      'get_r_query_capabilities',
      'call_r_query_capability',
    ])
  })

  it('names an unsplit host by its key', async () => {
    const tools = bindTools(
      tk.$toolset({
        hosts: {
          users: tk.$host({
            description: 'Users',
            tools: all(tk.user),
            split: false,
          }),
        },
      }),
      { app, context: ctx },
    )
    expect((await tools.list()).map((d) => [d.name, d.annotations])).toEqual([
      ['get_users_capabilities', { readOnlyHint: true }],
      ['call_users_capability', { readOnlyHint: false, destructiveHint: true }],
    ])
  })
})

describe('get_*_capabilities', () => {
  it('returns summaries by default, limited to 5', async () => {
    const result = json(await split.call('get_users_query_capabilities', {}))
    expect(result).toEqual({
      scope: 'users_query',
      total: 3,
      categories: ['team', 'user'],
      tools: [
        {
          name: 'user_find',
          description: 'Find a user by id',
          effect: 'read',
          category: 'user',
        },
        {
          name: 'user_search',
          description: 'Search users by name',
          effect: 'read',
          category: 'user',
        },
        {
          name: 'team_find',
          description: 'Find a team',
          effect: 'read',
          category: 'team',
        },
      ],
    })
  })

  it('ranks by query over name, description, tags, and aliases', async () => {
    const byAlias = json(
      await split.call('get_users_query_capabilities', { query: 'directory' }),
    )
    expect(byAlias.tools.map((t: { name: string }) => t.name)).toEqual([
      'user_search',
    ])
    const byWords = json(
      await split.call('get_users_query_capabilities', {
        query: 'find team',
        detail: 'name',
        limit: 1,
      }),
    )
    expect(byWords.tools).toEqual([{ name: 'team_find' }])
  })

  it('filters by category and exact names; full detail adds schema', async () => {
    const cat = json(
      await split.call('get_users_query_capabilities', { category: 'team' }),
    )
    expect(cat.tools.map((t: { name: string }) => t.name)).toEqual([
      'team_find',
    ])
    const full = json(
      await split.call('get_users_query_capabilities', {
        names: ['user_find', 'nope'],
        detail: 'full',
      }),
    )
    expect(full.tools[0].inputSchema).toMatchObject({
      properties: { id: { type: 'string' } },
    })
    expect(full.tools[0].inputSchema.properties).not.toHaveProperty('tenantId')
    expect(full.unknown).toEqual(['nope'])
  })

  it('rejects bad arguments with a message', async () => {
    const result = await split.call('get_users_query_capabilities', {
      detail: 'everything',
    })
    expect(result.isError).toBe(true)
    expect(text(result)).toBe(
      'Invalid input for get_users_query_capabilities: detail must be "name", "summary", or "full"',
    )
  })
})

describe('call_*_capability', () => {
  it('runs the inner tool with inject, mappers, and errors', async () => {
    const result = await split.call('call_users_query_capability', {
      name: 'user_find',
      input: { id: 'u1' },
    })
    expect(json(result)).toMatchObject({ id: 'u1', firstName: 'Ada' })
  })

  it('lists valid names for an unknown capability', async () => {
    const result = await split.call('call_users_operations_capability', {
      name: 'user_nuke',
      input: {},
    })
    expect(text(result)).toBe(
      'Unknown capability "user_nuke". Valid: user_remove, user_ping',
    )
  })

  it('does not run a tool from the other bucket', async () => {
    const result = await split.call('call_users_query_capability', {
      name: 'user_remove',
      input: { id: 'u1' },
    })
    expect(result.isError).toBe(true)
  })

  it('returns issues and the inner schema for invalid input', async () => {
    const result = await split.call('call_users_query_capability', {
      name: 'user_find',
      input: {},
    })
    expect(text(result)).toMatch(
      /^Invalid input for user_find: id: .*\nExpected schema: \{"type":"object"/,
    )
  })
})
