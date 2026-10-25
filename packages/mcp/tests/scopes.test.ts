import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import {
  type AuthInfo,
  createMcpHandler,
  InMemoryTransport,
} from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { all, bindTools, createToolkit } from '../src/index.js'
import { stepUpScopes } from '../src/scopes.js'
import { createMcpFactory } from '../src/sdk.js'
import { app, type Ctx, contract } from './fixture.js'

const tk = createToolkit(contract).$context<Ctx>()
const ctx = (): Ctx => ({ tenantId: 't', tenantNo: 1 })
const tenant = { tenantId: ({ context }: { context: Ctx }) => context.tenantId }
const closers: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()))
})

const tools = bindTools(
  tk.$toolset({
    tools: {
      user_find: tk.user.find.inject(tenant),
      admin_purge: tk.admin.purge.inject(tenant).scopes(['admin']),
      ops_note: tk.$tool({
        description: 'Leave a note.',
        effect: 'write',
        input: z.object({ text: z.string() }),
        run: () => 'noted',
        scopes: ['notes:write'],
      }),
    },
    hosts: {
      users: tk.$host({
        description: 'User accounts.',
        tools: [
          all(tk.user, { exclude: [tk.user.remove], inject: tenant }),
          { user_remove: tk.user.remove.inject(tenant).scopes(['admin']) },
        ],
      }),
    },
  }),
  { app, context: ctx },
)

describe('scopesFor', () => {
  it('reads a flat tool, a composite, and a host call per inner tool', async () => {
    expect(await tools.scopesFor?.('admin_purge', {})).toEqual(['admin'])
    expect(await tools.scopesFor?.('ops_note', {})).toEqual(['notes:write'])
    expect(await tools.scopesFor?.('user_find', {})).toEqual([])
    const call = 'call_users_operations_capability'
    expect(await tools.scopesFor?.(call, { name: 'user_remove' })).toEqual([
      'admin',
    ])
    expect(await tools.scopesFor?.(call, { name: 'user_ping' })).toEqual([])
    expect(await tools.scopesFor?.(call, undefined)).toEqual([])
    expect(
      await tools.scopesFor?.('get_users_operations_capabilities', {}),
    ).toEqual([])
    expect(await tools.scopesFor?.('nope', {})).toEqual([])
  })

  it('applies all({ scopes }) to every selected tool', async () => {
    const scoped = bindTools(
      tk.$toolset({
        tools: all(tk.admin, { inject: tenant, scopes: ['admin'] }),
      }),
      { app, context: ctx },
    )
    expect(await scoped.scopesFor?.('admin_flags', {})).toEqual(['admin'])
  })

  it('rejects a scope the OAuth grammar does not allow', () => {
    expect(() => tk.admin.purge.scopes(['has space'])).toThrow(
      '.scopes(): "has space" is not an OAuth scope token',
    )
    expect(() => all(tk.admin, { scopes: ['a"b'] })).toThrow(TypeError)
  })

  it('does not enforce on McpTools.call (middleware does)', async () => {
    const result = await tools.call(
      'admin_purge',
      {},
      { authInfo: { token: 't', clientId: 'c', scopes: [] } },
    )
    expect(result.isError).toBeUndefined()
  })
})

describe('scopes on a hidden tool', () => {
  const isAdmin = (info: { authInfo?: { scopes: string[] } }) =>
    info.authInfo?.scopes.includes('admin') ?? false
  const hidden = bindTools(
    tk.$toolset({
      tools: { admin_purge: tk.admin.purge.inject(tenant).visible(isAdmin) },
      hosts: {
        users: tk.$host({
          description: 'User accounts.',
          tools: [
            all(tk.user, { exclude: [tk.user.remove], inject: tenant }),
            {
              user_remove: tk.user.remove
                .inject(tenant)
                .visible(isAdmin)
                .scopes(['users:delete']),
            },
          ],
        }),
      },
    }),
    { app, context: ctx },
  )
  const user = { authInfo: { token: 't', clientId: 'c', scopes: ['mcp'] } }
  const call = 'call_users_operations_capability'

  it('reports no scopes for a tool the caller cannot see', async () => {
    expect(
      await hidden.scopesFor?.(call, { name: 'user_remove' }, user),
    ).toEqual([])
    const admin = { authInfo: { ...user.authInfo, scopes: ['admin'] } }
    expect(
      await hidden.scopesFor?.(call, { name: 'user_remove' }, admin),
    ).toEqual(['users:delete'])
  })

  it('answers Unknown capability over HTTP instead of a step-up', async () => {
    const handler = createMcpHandler(
      createMcpFactory(hidden, { name: 'x', version: '1' }),
    )
    closers.push(() => handler.close())
    const client = new Client(
      { name: 'test', version: '1' },
      { versionNegotiation: { mode: 'auto' } },
    )
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://local/mcp'), {
        fetch: (url, init) =>
          handler.fetch(new Request(url, init), { authInfo: user.authInfo }),
      }),
    )
    closers.push(() => client.close())
    const result = await client.callTool({
      name: call,
      arguments: { name: 'user_remove', input: { id: 'x' } },
    })
    expect((result.content as { text: string }[])[0]?.text).toBe(
      'Unknown capability "user_remove". Valid: user_ping',
    )
  })
})

describe('stepUpScopes', () => {
  it('asks for granted plus required, naming what is missing', () => {
    expect(stepUpScopes(['admin'], ['mcp'])).toEqual({
      scopes: ['mcp', 'admin'],
      missing: ['admin'],
    })
    expect(stepUpScopes(['admin'], ['mcp', 'admin'])).toBeUndefined()
    expect(stepUpScopes([], [])).toBeUndefined()
  })
})

describe('createMcpFactory scope step-up', () => {
  const factory = createMcpFactory(tools, { name: 'x', version: '1' })

  /** Records each HTTP response so the 403 challenge can be read. */
  async function http(mode: 'auto' | 'legacy', authInfo: AuthInfo) {
    const handler = createMcpHandler(factory)
    closers.push(() => handler.close())
    const responses: Response[] = []
    const client = new Client(
      { name: 'test', version: '1' },
      { versionNegotiation: { mode } },
    )
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://local/mcp'), {
        fetch: async (url, init) => {
          const response = await handler.fetch(new Request(url, init), {
            authInfo,
          })
          responses.push(response.clone())
          return response
        },
      }),
    )
    closers.push(() => client.close())
    return { client, responses }
  }

  const base: AuthInfo = {
    token: 't',
    clientId: 'c',
    scopes: ['mcp'],
    resourceMetadataUrl:
      'https://api.example.com/.well-known/oauth-protected-resource/mcp',
  }

  it.each(['auto', 'legacy'] as const)(
    'answers a missing scope with 403 insufficient_scope (%s)',
    async (mode) => {
      const { client, responses } = await http(mode, base)
      await expect(
        client.callTool({
          name: 'call_users_operations_capability',
          arguments: { name: 'user_remove', input: { id: 'nobody' } },
        }),
      ).rejects.toThrow()
      const challenge = responses.at(-1)
      expect(challenge?.status).toBe(403)
      const header = challenge?.headers.get('www-authenticate') ?? ''
      expect(header).toContain('error="insufficient_scope"')
      expect(header).toContain('scope="mcp admin"')
      expect(header).toContain(
        `resource_metadata="${base.resourceMetadataUrl}"`,
      )
      expect(header).toContain('error_description="Requires scope admin"')
    },
  )

  it('runs the call once the token holds the scope', async () => {
    const { client } = await http('auto', {
      ...base,
      scopes: ['mcp', 'admin'],
    })
    const result = await client.callTool({
      name: 'call_users_operations_capability',
      arguments: { name: 'user_remove', input: { id: 'nobody' } },
    })
    expect(result.isError).toBeUndefined()
  })

  it('never challenges an unscoped inner tool', async () => {
    const { client } = await http('auto', base)
    const ping = await client.callTool({
      name: 'call_users_operations_capability',
      arguments: { name: 'user_ping' },
    })
    expect(ping.isError).toBeUndefined()
  })

  it('does not challenge over stdio (no OAuth there)', async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    const server = serveStdio((c) => factory({ ...c, authInfo: base }), {
      transport: serverSide,
    })
    closers.push(() => server.close())
    const client = new Client(
      { name: 'test', version: '1' },
      { versionNegotiation: { mode: 'auto' } },
    )
    await client.connect(clientSide)
    closers.push(() => client.close())
    const result = await client.callTool({ name: 'admin_purge', arguments: {} })
    expect(result.isError).toBeUndefined()
  })
})
