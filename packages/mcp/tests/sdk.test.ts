import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { createClient, type Link } from '@ts-pf/client'
import { lookupProcedure, runProcedure } from '@ts-pf/server'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { all, bindTools, createToolkit, type McpTools } from '../src/index.js'
import { createMcpFactory } from '../src/sdk.js'
import { app, type Ctx, contract } from './fixture.js'

const tk = createToolkit(contract).$context<Ctx>()
const ctx = (): Ctx => ({ tenantId: 't', tenantNo: 1 })
const tenant = { tenantId: ({ context }: { context: Ctx }) => context.tenantId }
const handlers: { close(): Promise<void> }[] = []

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((h) => h.close()))
})

async function connect(factory: ReturnType<typeof createMcpFactory>) {
  const handler = createMcpHandler(factory)
  handlers.push(handler)
  const client = new Client(
    { name: 'test', version: '1' },
    { versionNegotiation: { mode: 'auto' } },
  )
  const authInfo = { token: 't', clientId: 'tester', scopes: ['admin'] }
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init), { authInfo }),
    }),
  )
  return client
}

describe('createMcpFactory', () => {
  it('builds a fresh McpServer per request', async () => {
    const tools: McpTools = {
      list: async () => [],
      call: async () => ({ content: [] }),
    }
    const factory = createMcpFactory(tools, { name: 'x', version: '1' })
    const a = await factory({ era: 'modern' })
    const b = await factory({ era: 'modern' })
    expect(a).toBeInstanceOf(McpServer)
    expect(a).not.toBe(b)
  })

  it('serves every procedure from an app, skipping hidden ones', async () => {
    const seen: unknown[] = []
    const client = await connect(
      createMcpFactory(app, {
        name: 'app',
        version: '1',
        context: (info) => {
          seen.push(info.authInfo?.clientId)
          return ctx()
        },
      }),
    )
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual([
      'user_find',
      'user_search',
      'user_remove',
      'user_ping',
      'team_find',
      'admin_purge',
      'admin_flags',
      'legacy_report',
      'internal_reindex',
    ])
    const result = await client.callTool({ name: 'user_ping', arguments: {} })
    expect(result.content).toEqual([{ type: 'text', text: 'pong' }])
    expect(seen).toEqual(['tester'])
  })

  it('serves bound tools with our validation messages and structuredContent', async () => {
    const find = tk.user.find
      .inject(tenant)
      .output(z.object({ name: z.string() }), (u) => ({ name: u.firstName }))
    const tools = bindTools(tk.$toolset({ tools: { find } }), {
      app,
      context: ctx,
      onError: () => {},
    })
    const client = await connect(
      createMcpFactory(tools, { name: 'shaped', version: '1' }),
    )
    const ok = await client.callTool({ name: 'find', arguments: { id: 'u1' } })
    expect(ok.structuredContent).toEqual({ name: 'Ada' })
    const bad = await client.callTool({ name: 'find', arguments: { id: 7 } })
    expect(bad.isError).toBe(true)
    expect((bad.content as { text: string }[])[0]?.text).toMatch(
      /^Invalid input for find: id: /,
    )
  })
})

describe('bindTools({ client }) with createClient', () => {
  it('tells a client proxy from a per-caller factory', async () => {
    const link: Link = {
      call: (path, input) => {
        const procedure = lookupProcedure(app, path)
        if (!procedure) throw new Error(path.join('.'))
        return runProcedure(procedure, input, ctx())
      },
    }
    const client = createClient<typeof contract>(link)
    const ts = tk.$toolset({ tools: all(tk.user, { inject: tenant }) })
    const direct = bindTools(ts, { client, context: ctx })
    const perCaller = bindTools(ts, { client: () => client, context: ctx })
    for (const tools of [direct, perCaller]) {
      const result = await tools.call('user_find', { id: 'u1' })
      expect(result.isError).toBeUndefined()
    }
  })
})
