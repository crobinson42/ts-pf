import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import {
  type AuthInfo,
  createMcpHandler,
  InMemoryTransport,
  type McpServerFactory,
} from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { audit } from '@ts-pf/mcp'
import { afterAll, describe, expect, it } from 'vitest'
import { factory, planetsMcp } from '../src/mcp.js'

type Mode = 'auto' | 'legacy'
type Connect = (who: AuthInfo) => Promise<Client>

const alice: AuthInfo = { token: 'a', clientId: 'ws-alice', scopes: [] }
const closers: (() => Promise<void>)[] = []
afterAll(async () => {
  await Promise.all(closers.map((close) => close()))
})

/** Records the era the SDK hands the factory, so each mode is proven server-side. */
function recording(eras: string[]): McpServerFactory {
  return (ctx) => {
    eras.push(ctx.era)
    return factory(ctx)
  }
}

const newClient = (mode: Mode) =>
  new Client({ name: 'smoke', version: '1' }, { versionNegotiation: { mode } })

const http =
  (mode: Mode, eras: string[]): Connect =>
  async (who) => {
    const handler = createMcpHandler(recording(eras))
    closers.push(() => handler.close())
    const client = newClient(mode)
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://local/mcp'), {
        fetch: (url, init) =>
          handler.fetch(new Request(url, init), { authInfo: who }),
      }),
    )
    closers.push(() => client.close())
    return client
  }

// stdio never carries a token: identity comes from the process (env / config).
const stdio =
  (mode: Mode, eras: string[]): Connect =>
  async (who) => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    const record = recording(eras)
    const server = serveStdio((ctx) => record({ ...ctx, authInfo: who }), {
      transport: serverSide,
    })
    closers.push(() => server.close())
    const client = newClient(mode)
    await client.connect(clientSide)
    closers.push(() => client.close())
    return client
  }

const text = (result: unknown) =>
  (result as { content: { text: string }[] }).content[0]?.text ?? ''

describe.each([
  ['HTTP', 'auto', http, 'modern'],
  ['HTTP', 'legacy', http, 'legacy'],
  ['stdio', 'auto', stdio, 'modern'],
  ['stdio', 'legacy', stdio, 'legacy'],
] as const)('%s, versionNegotiation %s', (name, mode, transport, era) => {
  const eras: string[] = []
  // Each block deletes from its own workspace, so blocks stay independent.
  const root: AuthInfo = {
    token: 'r',
    clientId: `ws-root-${name}-${mode}`,
    scopes: ['admin'],
  }
  const connect = transport(mode, eras)

  it('lists flat tools plus the split host pairs', async () => {
    const client = await connect(alice)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual([
      'planet_find',
      'ops_stats',
      'get_planets_query_capabilities',
      'call_planets_query_capability',
      'get_planets_operations_capabilities',
      'call_planets_operations_capability',
    ])
    const find = tools.find((t) => t.name === 'planet_find')
    expect(find?.inputSchema.properties).toEqual({
      id: expect.objectContaining({ type: 'integer' }),
    })
    expect(find?.outputSchema).toBeDefined()
    const ops = tools.find(
      (t) => t.name === 'call_planets_operations_capability',
    )
    expect(ops?.annotations).toMatchObject({ destructiveHint: true })
    expect(eras.length).toBeGreaterThan(0)
    expect(eras.every((e) => e === era)).toBe(true)
  })

  it('calls a shaped tool: inject, reshaped output, structuredContent', async () => {
    const client = await connect(alice)
    const result = await client.callTool({
      name: 'planet_find',
      arguments: { id: 3 },
    })
    expect(result.structuredContent).toEqual({
      id: 3,
      name: 'Neptune',
      summary: 'Neptune has 16 moons, discovered by Le Verrier.',
    })
  })

  it('returns our validation message and next-step errors', async () => {
    const client = await connect(alice)
    const invalid = await client.callTool({
      name: 'planet_find',
      arguments: { id: 'x' },
    })
    expect(invalid.isError).toBe(true)
    expect(text(invalid)).toMatch(/^Invalid input for planet_find: id: /)
    const missing = await client.callTool({
      name: 'planet_find',
      arguments: { id: 99 },
    })
    expect(text(missing)).toBe(
      'No planet with id 99. Call call_planets_query_capability with name "planet_list" to see ids.',
    )
  })

  it('discovers and runs host capabilities; middleware enforces scope', async () => {
    const client = await connect(alice)
    const found = await client.callTool({
      name: 'get_planets_operations_capabilities',
      arguments: { query: 'delete', detail: 'name' },
    })
    expect(JSON.parse(text(found)).tools[0]).toEqual({ name: 'planet_remove' })
    const denied = await client.callTool({
      name: 'call_planets_operations_capability',
      arguments: { name: 'planet_remove', input: { id: 1 } },
    })
    expect(text(denied)).toBe('FORBIDDEN: Requires the admin scope')
    const admin = await connect(root)
    const removed = await admin.callTool({
      name: 'call_planets_operations_capability',
      arguments: { name: 'planet_remove', input: { id: 1 } },
    })
    expect(JSON.parse(text(removed))).toEqual({ removed: true })
    const unknown = await admin.callTool({
      name: 'call_planets_operations_capability',
      arguments: { name: 'planet_nuke', input: {} },
    })
    expect(text(unknown)).toBe(
      'Unknown capability "planet_nuke". Valid: planet_rename, planet_remove',
    )
  })

  it('answers an unknown tool with a protocol error', async () => {
    const client = await connect(alice)
    await expect(
      client.callTool({ name: 'planet_nuke', arguments: {} }),
    ).rejects.toMatchObject({ code: -32602 })
  })
})

describe('audit', () => {
  it('finds no errors in the example toolset', () => {
    expect(audit([planetsMcp]).filter((f) => f.level === 'error')).toEqual([])
  })
})
