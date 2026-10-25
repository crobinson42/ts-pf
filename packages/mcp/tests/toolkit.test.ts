import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { all, createToolkit } from '../src/index.js'
import { toolSpec } from '../src/tool.js'
import { type Ctx, contract } from './fixture.js'

const tk = createToolkit(contract).$context<Ctx>()
const tenant = { tenantId: ({ context }: { context: Ctx }) => context.tenantId }

describe('createToolkit', () => {
  it('mirrors the contract with memoized builders', () => {
    expect(tk.user.find).toBe(tk.user.find)
    expect(toolSpec(tk.user.find).path).toBe('user.find')
    expect(tk.$context()).toBe(tk)
    expect((tk as unknown as Record<string, unknown>).nope).toBeUndefined()
  })

  it('returns a new builder from every method', () => {
    const a = tk.user.find
    const b = a.describe('x')
    expect(b).not.toBe(a)
    expect(toolSpec(a).description).toBeUndefined()
    expect(toolSpec(b).description).toBe('x')
    const c = b.inject(tenant).errors({ NOT_FOUND: () => 'n' })
    expect(Object.keys(toolSpec(c).inject)).toEqual(['tenantId'])
    expect(Object.keys(toolSpec(b).inject)).toEqual([])
  })
})

describe('all()', () => {
  const names = (record: object) => Object.keys(record)

  it('skips docs({ hidden: true }) and filters by effect, tags, exclude', () => {
    expect(names(all(tk.user))).toEqual([
      'user_find',
      'user_search',
      'user_remove',
      'user_ping',
    ])
    expect(names(all(tk.user, { effect: 'read' }))).toEqual([
      'user_find',
      'user_search',
    ])
    expect(names(all(tk, { tags: ['people'] }))).toEqual(['user_search'])
    expect(
      names(all(tk, { exclude: [tk.user, tk.admin.flags, tk.legacy.report] })),
    ).toEqual(['team_find', 'admin_purge', 'internal_reindex'])
  })

  it('injects each key only into tools whose input has it', () => {
    const tools = all(tk.user, { inject: tenant })
    expect(Object.keys(toolSpec(tools.user_find).inject)).toEqual(['tenantId'])
    expect(Object.keys(toolSpec(tools.user_ping).inject)).toEqual([])
  })

  it('rejects a value that is not a node', () => {
    expect(() => all({} as never)).toThrow('all() takes a toolkit node')
  })
})

describe('$toolset / $host', () => {
  it('rejects duplicate names and host name collisions at runtime too', () => {
    expect(() =>
      tk.$toolset({
        tools: [all(tk.user), { user_find: tk.user.find }],
      } as never),
    ).toThrow('$toolset(): duplicate tool name "user_find"')
    const host = tk.$host({ description: 'A', tools: all(tk.admin) })
    expect(() =>
      tk.$toolset({
        tools: { get_admin_query_capabilities: tk.user.find },
        hosts: { admin: host },
      } as never),
    ).toThrow(
      '$toolset(): host "admin" generates "get_admin_query_capabilities", which tool "get_admin_query_capabilities" also uses',
    )
  })

  it('requires a host description', () => {
    expect(() => tk.$host({ description: '', tools: all(tk.admin) })).toThrow(
      '$host(): description is required',
    )
  })
})

describe('$coverage', () => {
  it('throws naming uncovered paths; hidden procedures count as decided', () => {
    const ts = tk.$toolset({ tools: [all(tk.user), all(tk.team)] })
    expect(() =>
      tk.$coverage({ toolsets: [ts], exclude: [tk.legacy] } as never),
    ).toThrow(
      '$coverage(): not exposed by any toolset nor excluded: admin.purge, admin.flags, internal.reindex',
    )
    const host = tk.$host({ description: 'A', tools: all(tk.admin) })
    tk.$coverage({
      toolsets: [ts, tk.$toolset({ hosts: { admin: host } })],
      exclude: [tk.legacy, tk.internal],
    })
  })

  it('does not count composite tools', () => {
    const composite = tk.$tool({
      description: 'x',
      effect: 'read',
      input: z.object({}),
      run: () => 'x',
    })
    expect(() =>
      tk.$coverage({
        toolsets: [tk.$toolset({ tools: { internal_reindex: composite } })],
        exclude: [tk.user, tk.team, tk.admin, tk.legacy],
      } as never),
    ).toThrow('internal.reindex')
  })
})
