// Round 2: combined adapter (per-request McpServer + passthrough schemas) end to end, plus per-request cost.
import {
  McpServer, createMcpHandler, fromJsonSchema, inputRequired, acceptedContent, InMemoryTransport,
  type AuthInfo, type CallToolResult, type InputRequiredResult, type McpServerFactory, type StandardSchemaWithJSON, type ToolAnnotations,
} from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

// ================= adapter (./sdk) =================
type Json = Record<string, unknown>
type McpCallInfo = { authInfo?: AuthInfo; requestInfo?: Request; signal?: AbortSignal; inputResponses?: Record<string, unknown>; era?: 'legacy' | 'modern' }
type McpToolDefinition = { name: string; description: string; inputSchema: Json; outputSchema?: Json; annotations?: ToolAnnotations }
interface McpTools {
  list(info: McpCallInfo): Promise<McpToolDefinition[]>
  call(name: string, args: unknown, info: McpCallInfo): Promise<CallToolResult | InputRequiredResult>
}
const passthrough = (s: Json): StandardSchemaWithJSON => ({ '~standard': { version: 1, vendor: 'ts-pf', validate: (value: unknown) => ({ value }), jsonSchema: { input: () => s, output: () => s } } })

export const createMcpFactory = (tools: McpTools, o: { name: string; version: string; instructions?: string; listTtlMs?: number }): McpServerFactory =>
  async ({ authInfo, requestInfo, era }) => {
    const s = new McpServer({ name: o.name, version: o.version }, { instructions: o.instructions, cacheHints: { 'tools/list': { ttlMs: o.listTtlMs ?? 0, cacheScope: 'private' } } })
    for (const d of await tools.list({ authInfo, requestInfo, era }))
      s.registerTool(d.name, { description: d.description, annotations: d.annotations, inputSchema: passthrough(d.inputSchema), outputSchema: d.outputSchema && passthrough(d.outputSchema) },
        (args, ctx) => tools.call(d.name, args, { authInfo: ctx.http?.authInfo ?? authInfo, requestInfo: ctx.http?.req, signal: ctx.mcpReq.signal, inputResponses: ctx.mcpReq.inputResponses, era }))
    return s
  }

// ================= in-memory McpTools over a registry =================
type Kind = 'read' | 'write' | 'destructive'
type Proc = { name: string; kind: Kind; description: string; input: Json; output?: Json; roles: string[]; host?: string; run: (i: any) => unknown }
const err = (text: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text }] })
const ok = (v: unknown): CallToolResult => ({ content: [{ type: 'text', text: JSON.stringify(v) }], ...(v && typeof v === 'object' ? { structuredContent: v as Json } : {}) })
const ann = (k: Kind): ToolAnnotations => ({ readOnlyHint: k === 'read', destructiveHint: k === 'destructive', idempotentHint: k !== 'write', openWorldHint: false })

function createRegistryTools(registry: Proc[], opts: { flat: (p: Proc) => boolean }): McpTools {
  const validators = new Map(registry.map(p => [p.name, fromJsonSchema(p.input)]))     // compiled once
  const confirmSchema = { type: 'object', properties: { confirm: { type: 'boolean' } }, required: ['confirm'] }
  const visible = (a?: AuthInfo) => registry.filter(p => p.roles.some(r => a?.scopes.includes(r)))

  async function run(p: Proc, raw: unknown, info: McpCallInfo): Promise<CallToolResult | InputRequiredResult> {
    const { confirmed, ...args } = (raw ?? {}) as Json
    const r = await validators.get(p.name)!['~standard'].validate(args)
    if (r.issues) return err(`Invalid input for ${p.name}: ${r.issues.map(i => i.message).join('; ')}\nExpected schema: ${JSON.stringify(p.input)}`)
    if (p.kind === 'destructive' && confirmed !== true && acceptedContent<{ confirm?: boolean }>(info.inputResponses, 'confirm')?.confirm !== true) {
      if (info.era === 'legacy') return err(`${p.name} is destructive. Ask the user to confirm, then retry with the same arguments plus "confirmed": true.`)
      return inputRequired({ inputRequests: { confirm: inputRequired.elicit({ message: `Really run ${p.name}?`, requestedSchema: confirmSchema as any }) } })
    }
    try { return ok(await p.run(r.value)) } catch (e) { return err((e as Error).message) }
  }

  // tool table per caller: flat tools + get/call per (host, bucket)
  type Entry = McpToolDefinition & { exec: (args: any, info: McpCallInfo) => Promise<CallToolResult | InputRequiredResult> }
  const cache = new Map<string, Entry[]>()   // keyed by sorted scopes: definitions precomputed once per scope set
  function table(a?: AuthInfo): Entry[] {
    const key = [...(a?.scopes ?? [])].sort().join(' ')
    if (cache.has(key)) return cache.get(key)!
    const vis = visible(a)
    const flat: Entry[] = vis.filter(opts.flat).map(p => ({ name: p.name, description: p.description, inputSchema: p.input, ...(p.output ? { outputSchema: p.output } : {}), annotations: ann(p.kind), exec: (x, i) => run(p, x, i) }))
    const groups = new Map<string, Proc[]>()
    for (const p of vis.filter(p => p.host && !opts.flat(p))) { const k = `${p.host}_${p.kind === 'read' ? 'query' : 'operations'}`; groups.set(k, [...(groups.get(k) ?? []), p]) }
    const hosts = [...groups].flatMap(([k, ps]): Entry[] => [
      { name: `get_${k}_capabilities`, description: `Discover ${k.replace('_', ' ')} capabilities (${ps.length}).`, annotations: { readOnlyHint: true },
        inputSchema: { type: 'object', properties: { query: { type: 'string' }, names: { type: 'array', items: { type: 'string' } } } },
        exec: async (x: { names?: string[] }) => ok({ scope: k, total: ps.length, tools: ps.slice(0, 50).map(p => ({ name: p.name, kind: p.kind, description: p.description, ...(x.names?.includes(p.name) ? { input: p.input } : {}) })) }) },
      { name: `call_${k}_capability`, description: `Run a ${k.replace('_', ' ')} capability by name.`,
        annotations: { readOnlyHint: k.endsWith('query'), destructiveHint: ps.some(p => p.kind === 'destructive') },
        inputSchema: { type: 'object', properties: { name: { type: 'string', ...(ps.length <= 50 ? { enum: ps.map(p => p.name) } : {}) }, input: { type: 'object' } }, required: ['name'] },
        exec: async (x: { name: string; input?: unknown }, i) => { const p = ps.find(q => q.name === x.name); return p ? run(p, x.input, i) : err(`Unknown capability "${x.name}". Valid: ${ps.map(q => q.name).slice(0, 50).join(', ')}`) } },
    ])
    cache.set(key, [...flat, ...hosts]); return cache.get(key)!
  }
  return {
    list: async info => table(info.authInfo),
    call: async (name, args, info) => { const t = table(info.authInfo).find(e => e.name === name); return t ? t.exec(args, info) : err(`Unknown tool ${name}`) },
  }
}

// ================= demo registry =================
const planets = new Map([[1, 'Mercury'], [2, 'Venus'], [3, 'Earth']])
const demo: Proc[] = [
  { name: 'planet_find', kind: 'read', roles: ['user', 'admin'], description: 'Find a planet by id.', host: 'demo',
    input: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } }, required: ['id'], additionalProperties: false },
    output: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } }, required: ['id', 'name'] },
    run: ({ id }) => { if (!planets.has(id)) throw new Error(`NOT_FOUND: planet ${id}`); return { id, name: planets.get(id) } } },
  { name: 'planet_search', kind: 'read', roles: ['user', 'admin'], description: 'Search planets by name.', host: 'demo',
    input: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] }, run: ({ q }) => ({ ids: [...planets].filter(([, n]) => n.includes(q)).map(([i]) => i) }) },
  { name: 'planet_rename', kind: 'write', roles: ['admin'], description: 'Rename a planet.', host: 'demo',
    input: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string', minLength: 2 } }, required: ['id', 'name'], additionalProperties: false },
    run: ({ id, name }) => (planets.set(id, name), { ok: true }) },
  { name: 'planet_delete', kind: 'destructive', roles: ['admin'], description: 'Delete a planet permanently.', host: 'demo',
    input: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'], additionalProperties: false }, run: ({ id }) => ({ deleted: planets.delete(id) }) },
]
const demoTools = createRegistryTools(demo, { flat: p => p.name === 'planet_find' })
const factory = createMcpFactory(demoTools, { name: 'demo', version: '1', listTtlMs: 30_000 })
const users: Record<string, AuthInfo> = { alice: { token: 'a', clientId: 'alice', scopes: ['user'] }, root: { token: 'r', clientId: 'root', scopes: ['admin'] } }

// ================= scenarios =================
const txt = (r: any) => r.thrown ?? (r.content?.[0]?.text ?? JSON.stringify(r)).slice(0, 220)
const call = (c: Client, name: string, args: Json) => c.callTool({ name, arguments: args }).catch(e => ({ thrown: `THROWN code=${e.code}: ${e.message}` }))
async function scenarios(label: string, connect: (who: string) => Promise<Client>) {
  console.log(`\n######## ${label}`)
  const alice = await connect('alice'), root = await connect('root')
  root.setRequestHandler('elicitation/create', async (r: any) => (console.log(`  elicitation -> ${r.params.message} (accept)`), { action: 'accept', content: { confirm: true } }))
  console.log('tools/list alice:', (await alice.listTools()).tools.map(t => t.name).join(', '))
  console.log('tools/list root :', (await root.listTools()).tools.map(t => t.name + (t.outputSchema ? '[out]' : '')).join(', '))
  console.log('valid planet_find      :', txt(await call(alice, 'planet_find', { id: 1 })))
  console.log('outputSchema structured:', JSON.stringify(((await call(alice, 'planet_find', { id: 3 })) as any).structuredContent))
  console.log('invalid args           :', txt(await call(alice, 'planet_find', { id: 'x' })))
  console.log('unknown inner          :', txt(await call(root, 'call_demo_operations_capability', { name: 'planet_nuke', input: {} })))
  console.log('hidden tool (alice)    :', txt(await call(alice, 'call_demo_operations_capability', { name: 'planet_delete', input: { id: 2 } })))
  const d1 = await call(root, 'call_demo_operations_capability', { name: 'planet_delete', input: { id: 2 } })
  console.log('destructive #1         :', txt(d1))
  if ((d1 as any).isError) console.log('destructive retry      :', txt(await call(root, 'call_demo_operations_capability', { name: 'planet_delete', input: { id: 2, confirmed: true } })))
  planets.set(2, 'Venus')
}

const handler = createMcpHandler(factory)
const httpClient = (mode: 'auto' | 'legacy') => async (who: string) => {
  const c = new Client({ name: who, version: '1' }, { capabilities: { elicitation: { form: {} } }, versionNegotiation: { mode } })
  await c.connect(new StreamableHTTPClientTransport(new URL('http://local/mcp'), { fetch: async (u, i) => handler.fetch(new Request(u, i), { authInfo: users[who] }) }))
  return c
}
const stdioClient = (mode: 'auto' | 'legacy') => async (who: string) => {
  const [ct, st] = InMemoryTransport.createLinkedPair()
  serveStdio(ctx => factory({ ...ctx, authInfo: users[who] }), { transport: st })  // stdio: identity from env/config
  const c = new Client({ name: who, version: '1' }, { capabilities: { elicitation: { form: {} } }, versionNegotiation: { mode } })
  await c.connect(ct as any); return c
}
await scenarios('HTTP modern (auto)', httpClient('auto'))
await scenarios('HTTP legacy', httpClient('legacy'))
await scenarios('stdio modern (auto)', stdioClient('auto'))
await scenarios('stdio legacy', stdioClient('legacy'))

// raw modern requests (also used for timing)
const env = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'raw', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} }
const rawReq = (method: string, params: Json, extra: Record<string, string> = {}) => new Request('http://local/mcp', { method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2026-07-28', 'mcp-method': method, ...extra },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: env } }) })
const rawList = await (await handler.fetch(rawReq('tools/list', {}), { authInfo: users.alice })).json()
console.log('\nraw tools/list (alice):', JSON.stringify({ ...rawList.result, tools: rawList.result.tools.map((t: any) => t.name) }))
const rawCall = await handler.fetch(rawReq('tools/call', { name: 'planet_find', arguments: { id: 1 } }, { 'mcp-name': 'planet_find' }), { authInfo: users.alice })
console.log('raw tools/call status', rawCall.status, (await rawCall.text()).slice(0, 160))

// ================= timing =================
const synth = (n: number): Proc[] => Array.from({ length: n }, (_, i) => ({
  name: `svc${i % 4}_op${i}`, kind: (['read', 'write', 'read', 'destructive'] as Kind[])[i % 4], roles: ['admin'], description: `Synthetic operation ${i} on service ${i % 4}.`, host: `svc${i % 4}`,
  input: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'integer' }, c: { type: 'boolean' }, d: { type: 'array', items: { type: 'string' } }, e: { type: 'string', enum: ['x', 'y'] } }, required: ['a', 'b'], additionalProperties: false },
  run: x => ({ echo: x.a }),
}))
const big = synth(400)
const pct = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return `p50 ${s[Math.floor(s.length * 0.5)].toFixed(2)} / p95 ${s[Math.floor(s.length * 0.95)].toFixed(2)}` }
async function time(label: string, f: McpServerFactory, callName: string, callArgs: Json) {
  const h = createMcpHandler(f), auth = { token: 't', clientId: 'c', scopes: ['admin'] }
  const fac: number[] = [], list: number[] = [], call: number[] = []
  for (let i = 0; i < 220; i++) {
    let t = performance.now(); await f({ era: 'modern', authInfo: auth }); const tf = performance.now() - t
    t = performance.now(); const lr = await h.fetch(rawReq('tools/list', {}), { authInfo: auth }); await lr.text(); const tl = performance.now() - t
    t = performance.now(); const cr = await h.fetch(rawReq('tools/call', { name: callName, arguments: callArgs }, { 'mcp-name': callName }), { authInfo: auth }); const body = await cr.text(); const tc = performance.now() - t
    if (i === 0 && !body.includes('echo')) console.log('  !! call body', body.slice(0, 200))
    if (i >= 20) { fac.push(tf); list.push(tl); call.push(tc) }            // 20 warmup
  }
  console.log(`| ${label} | ${pct(fac)} | ${pct(list)} | ${pct(call)} |`)
  await h.close()
}
console.log('\n| case | factory (list + registerTool) ms | e2e tools/list ms | e2e tools/call ms |\n|---|---|---|---|')
const flatTools = createRegistryTools(big, { flat: () => true })
const hostTools = createRegistryTools(big, { flat: () => false })
await time('(a) 400 flat', createMcpFactory(flatTools, { name: 'b', version: '1' }), 'svc0_op0', { a: 'hi', b: 1 })
await time('(b) 4 hosts / 8 tools', createMcpFactory(hostTools, { name: 'b', version: '1' }), 'call_svc0_query_capability', { name: 'svc0_op0', input: { a: 'hi', b: 1 } })

// optimization probe: reuse one McpServer instance across requests (sequential + concurrent)
const shared = await createMcpFactory(flatTools, { name: 'b', version: '1' })({ era: 'modern', authInfo: { token: 't', clientId: 'c', scopes: ['admin'] } })
const hs = createMcpHandler(() => shared, { onerror: e => console.log('  onerror:', e.message.slice(0, 160)) }), auth = { token: 't', clientId: 'c', scopes: ['admin'] }
const one = async (i: number) => { const r = await hs.fetch(rawReq('tools/call', { name: 'svc0_op0', arguments: { a: `n${i}`, b: 1 } }, { 'mcp-name': 'svc0_op0' }), { authInfo: auth }); return `${r.status}:${(await r.text()).match(/echo\\":\\"(n\d+)|"message":"([^"]{0,90})/)?.slice(1).find(Boolean)}` }
try { console.log('\nshared instance sequential:', [await one(1), await one(2)].join(' | ')) } catch (e) { console.log('shared sequential THROWN', String(e)) }
try { console.log('shared instance concurrent:', (await Promise.all([3, 4, 5].map(one))).join(' | ')) } catch (e) { console.log('shared concurrent THROWN', String(e)) }
await handler.close(); await hs.close()
process.exit(0)
