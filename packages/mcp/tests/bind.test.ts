import { procedure, router } from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import {
  type CallInterceptor,
  createImplementer,
  createLocalClient,
} from '@ts-pf/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  all,
  bindTools,
  createToolkit,
  type McpCallInfo,
} from '../src/index.js'
import { app, type Ctx, calls, contract } from './fixture.js'

const tk = createToolkit(contract).$context<Ctx>()
const ctx = (): Ctx => ({ tenantId: 'ctx-tenant', tenantNo: 1 })
const tenant = { tenantId: ({ context }: { context: Ctx }) => context.tenantId }
const text = (r: { content: { text: string }[] }) => r.content[0]?.text

afterEach(() => {
  calls.length = 0
  vi.restoreAllMocks()
})

describe('bindTools (app)', () => {
  it('lists definitions with names, descriptions, annotations, and schemas', async () => {
    const tools = bindTools(
      tk.$toolset({
        tools: [
          all(tk.user, { inject: tenant }),
          { team_find: tk.team.find.examples([{ tenantId: 't', id: 't1' }]) },
        ],
      }),
      { app, context: ctx },
    )
    const list = await tools.list()
    expect(list.map((d) => d.name)).toEqual([
      'user_find',
      'user_search',
      'user_remove',
      'user_ping',
      'team_find',
    ])
    const [find, , remove, ping, team] = list
    expect(find?.description).toBe('Find a user by id')
    expect(find?.annotations).toEqual({ readOnlyHint: true })
    expect(find?.inputSchema).toMatchObject({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    })
    expect(find?.inputSchema.properties).not.toHaveProperty('tenantId')
    expect(find?.outputSchema).toBeUndefined()
    expect(remove?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
    })
    expect(ping?.effect).toBe('write')
    expect(ping?.inputSchema).toEqual({ type: 'object', properties: {} })
    expect(team?.description).toBe(
      'Find a team\n\nExamples:\n{"tenantId":"t","id":"t1"}',
    )
  })

  it('fills injected keys per call, over anything the model sent', async () => {
    const tools = bindTools(
      tk.$toolset({ tools: all(tk.user, { inject: tenant }) }),
      { app, context: ctx },
    )
    const result = await tools.call('user_find', { id: 'u1', tenantId: 'evil' })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(text(result) ?? '')).toMatchObject({ id: 'u1' })
    expect(calls).toEqual(['user.find:ctx-tenant:ctx-tenant'])
  })

  it('maps .input() args to the procedure input', async () => {
    const find = tk.user.find.input(
      z.object({ userId: z.string() }),
      (args, { context }) => ({ tenantId: context.tenantId, id: args.userId }),
    )
    const tools = bindTools(tk.$toolset({ tools: { find } }), {
      app,
      context: ctx,
    })
    const [def] = await tools.list()
    expect(def?.inputSchema).toMatchObject({ properties: { userId: {} } })
    expect(text(await tools.call('find', { userId: 'u1' }))).toContain('Ada')
    const bad = await tools.call('find', { id: 'u1' })
    expect(bad.isError).toBe(true)
    expect(text(bad)).toMatch(/^Invalid input for find: userId: /)
    expect(text(bad)).toContain('Expected schema: {"type":"object"')
  })

  it('reshapes and joins output; advertises and checks outputSchema', async () => {
    const view = z.object({ name: z.string(), team: z.string() })
    const find = tk.user.find
      .inject(tenant)
      .output(view, async (u, { call, context }) => {
        const team = await call.team.find({
          tenantId: context.tenantId,
          id: u.teamId,
        })
        return { name: `${u.firstName} ${u.lastName}`, team: team.name }
      })
    const tools = bindTools(tk.$toolset({ tools: { find } }), {
      app,
      context: ctx,
    })
    const [def] = await tools.list()
    expect(def?.outputSchema).toMatchObject({
      type: 'object',
      properties: { name: { type: 'string' }, team: { type: 'string' } },
    })
    const result = await tools.call('find', { id: 'u1' })
    expect(result.structuredContent).toEqual({
      name: 'Ada Lovelace',
      team: 'Team t1',
    })
  })

  it('reports an output that breaks its schema as INTERNAL', async () => {
    const onError = vi.fn()
    const find = tk.user.find
      .inject(tenant)
      .output(z.object({ n: z.number() }), () => ({ n: 'x' }) as never)
    const tools = bindTools(tk.$toolset({ tools: { find } }), {
      app,
      context: ctx,
      onError,
    })
    const result = await tools.call('find', { id: 'u1' })
    expect(result).toEqual({
      content: [{ type: 'text', text: 'INTERNAL: Internal server error' }],
      isError: true,
    })
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]?.[1]).toMatchObject({
      tool: { name: 'find', path: 'user.find' },
    })
  })

  it('rewrites declared errors and passes other PFErrors through', async () => {
    const find = tk.user.find.inject(tenant).errors({
      NOT_FOUND: ({ data }) => `No user ${data.id}. Use user_search first.`,
    })
    const tools = bindTools(
      tk.$toolset({ tools: { find, raw: tk.user.find.inject(tenant) } }),
      { app, context: ctx, onError: () => {} },
    )
    expect(text(await tools.call('find', { id: 'nope' }))).toBe(
      'No user nope. Use user_search first.',
    )
    expect(text(await tools.call('raw', { id: 'nope' }))).toBe(
      'NOT_FOUND: NOT_FOUND\n{"id":"nope"}',
    )
  })

  it('returns validation issues with the model-facing schema', async () => {
    const tools = bindTools(
      tk.$toolset({ tools: all(tk.user, { inject: tenant }) }),
      { app, context: ctx, onError: () => {} },
    )
    const result = await tools.call('user_find', { id: 42 })
    expect(result.isError).toBe(true)
    expect(text(result)).toMatch(/^Invalid input for user_find: id: /)
    expect(text(result)).not.toContain('"tenantId"')
  })

  it('never leaks unknown throws; logs them unless onError is given', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tools = bindTools(tk.$toolset({ tools: all(tk.internal) }), {
      app,
      context: ctx,
    })
    const result = await tools.call('internal_reindex', {})
    expect(text(result)).toBe('INTERNAL: Internal server error')
    expect(error).toHaveBeenCalledWith(
      '[ts-pf/mcp] Unhandled error in "internal_reindex":',
      expect.objectContaining({ message: 'disk on fire' }),
    )
    const onError = vi.fn()
    const quiet = bindTools(tk.$toolset({ tools: all(tk.internal) }), {
      app,
      context: ctx,
      onError,
    })
    await quiet.call('internal_reindex', {})
    expect(onError).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledOnce()
  })

  it('does not log declared errors by default', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tools = bindTools(
      tk.$toolset({ tools: all(tk.user, { inject: tenant }) }),
      { app, context: ctx },
    )
    await tools.call('user_find', { id: 'nope' })
    expect(error).not.toHaveBeenCalled()
  })

  it('truncates long text at maxResultChars', async () => {
    const tools = bindTools(
      tk.$toolset({
        tools: { long: tk.user.ping.output(() => 'x'.repeat(50)) },
      }),
      { app, context: ctx, maxResultChars: 10 },
    )
    expect(text(await tools.call('long', {}))).toBe(
      'xxxxxxxxxx\n\n[Truncated: 40 more characters. Narrow the request to see the rest.]',
    )
  })

  it('runs interceptors with the procedure path and passes the signal', async () => {
    const seen: string[] = []
    const interceptor: CallInterceptor = async (opts) => {
      seen.push(`${opts.path.join('.')}:${opts.signal?.aborted}`)
      return opts.next()
    }
    const infos: McpCallInfo[] = []
    const tools = bindTools(
      tk.$toolset({ tools: all(tk.user, { inject: tenant }) }),
      {
        app,
        context: (info) => {
          infos.push(info)
          return ctx()
        },
        interceptors: [interceptor],
      },
    )
    const signal = new AbortController().signal
    await tools.call('user_find', { id: 'u1' }, { signal, era: 'modern' })
    expect(seen).toEqual(['user.find:false'])
    expect(infos[0]).toMatchObject({
      signal,
      era: 'modern',
      tool: { name: 'user_find', path: 'user.find' },
    })
  })

  it('runs composite tools over call', async () => {
    const both = tk.$tool({
      description: 'Find a user and their team',
      effect: 'read',
      input: z.object({ id: z.string() }),
      run: async ({ input, call, context }) => {
        const u = await call.user.find({
          tenantId: context.tenantId,
          id: input.id,
        })
        const t = await call.team.find({
          tenantId: context.tenantId,
          id: u.teamId,
        })
        return `${u.firstName} is in ${t.name}`
      },
    })
    const tools = bindTools(tk.$toolset({ tools: { both } }), {
      app,
      context: ctx,
    })
    const [def] = await tools.list()
    expect(def).toMatchObject({
      effect: 'read',
      annotations: { readOnlyHint: true },
    })
    expect(text(await tools.call('both', { id: 'u1' }))).toBe(
      'Ada is in Team t1',
    )
    expect((await tools.call('both', {})).isError).toBe(true)
  })

  it('answers an unknown tool with isError', async () => {
    const tools = bindTools(tk.$toolset({ tools: {} }), { app, context: ctx })
    expect(await tools.call('nope', {})).toEqual({
      content: [{ type: 'text', text: 'Unknown tool "nope"' }],
      isError: true,
    })
  })

  it('maps middleware errors like any other PFError', async () => {
    const guarded = router({ x: procedure.output(z.string()) })
    const impl = createImplementer(guarded).$context<{ role: string }>()
    const guardedApp = impl.router({
      x: impl.x
        .use(({ context, next }) => {
          if (context.role !== 'admin') {
            throw new PFError({ code: 'FORBIDDEN', message: 'Admins only' })
          }
          return next()
        })
        .handler(() => 'secret'),
    })
    const gtk = createToolkit(guarded).$context<{ role: string }>()
    const tools = bindTools(gtk.$toolset({ tools: all(gtk) }), {
      app: guardedApp,
      context: (info) => ({ role: info.authInfo?.scopes[0] ?? 'none' }),
      onError: () => {},
    })
    expect(text(await tools.call('x', {}))).toBe('FORBIDDEN: Admins only')
    const admin = { token: 't', clientId: 'c', scopes: ['admin'] }
    expect(text(await tools.call('x', {}, { authInfo: admin }))).toBe('secret')
  })
})

describe('bindTools (client)', () => {
  const ts = tk.$toolset({ tools: all(tk.user, { inject: tenant }) })

  it('runs through a static client', async () => {
    const client = createLocalClient(app, { context: ctx() })
    const tools = bindTools(ts, { client, context: ctx })
    expect(text(await tools.call('user_find', { id: 'u1' }))).toContain('Ada')
  })

  it('builds a client per caller', async () => {
    const factory = vi.fn((info: McpCallInfo) =>
      createLocalClient(app, {
        context: { tenantId: info.authInfo?.clientId ?? '-', tenantNo: 1 },
      }),
    )
    const tools = bindTools(ts, {
      client: factory,
      context: (info) => ({
        tenantId: `t-${info.authInfo?.clientId}`,
        tenantNo: 1,
      }),
    })
    const authInfo = { token: 't', clientId: 'acme', scopes: [] }
    await tools.call('user_find', { id: 'u1' }, { authInfo })
    expect(factory).toHaveBeenCalled()
    // upstream context from the client; the injected tenant from `context`
    expect(calls).toEqual(['user.find:acme:t-acme'])
  })
})
