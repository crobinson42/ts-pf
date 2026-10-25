# @ts-pf/mcp — Final Design & Decisions

Oct 25, 2026 · @Cory Robinson

## TL;DR

**Build `@ts-pf/mcp` as a typed projection of a ts-pf contract into MCP tools.** The contract defines the tools, an executor (your `app` in-process, or a remote client) runs them, and the official MCP SDK v2 serves them. Every capability you asked for is in v1, and the typed API and the server adapter both ran as working prototypes.

The whole developer experience, smallest to largest:

```ts
// 1. Bolt on: every procedure becomes a tool
export const factory = createMcpFactory(app, { name: 'therms', version: '1.0.0', context: (info) => ctxFrom(info) })

// 2. Shape for the model: rename by key, hide/inject inputs, reshape and join outputs, rewrite errors
const tk = createToolkit(contract).$context<AppCtx>()
const findUser = tk.user.find.describe('…').inject({ tenantId }).output(UserView, async (u, { call }) => ({ … }))

// 3. Split a 400-RPC contract: toolsets per concern, tool hosts for big groups, coverage enforced at compile time
export const adminMcp = tk.$toolset({ tools: { admin_overview: tk.admin.stats },
  hosts: { admin: tk.$host({ description: '…', tools: all(tk.admin) }) } })  // get_admin_{query,operations}_capabilities + call_admin_{query,operations}_capability
tk.$coverage({ toolsets: [usersMcp, adminMcp], exclude: [tk.internal] })
```

**What the evidence settled:**

- **Contract changes break the build at the exact tool.** A new procedure fails `$coverage` until someone exposes or excludes it. Measured cost: about +1 s of type-checking at 400 procedures.
- **Tool hosts implement your `get_X_capabilities` / `call_X_capability` pattern.** They are split into read (`query`) and write (`operations`) halves by default so approval prompts stay meaningful. Whole-server discovery is the same mechanism.
- **The server adapter serves HTTP and stdio, old and new MCP protocol versions.** It costs about 0.6 ms per request with 400 tools, keeps our own validation messages, and runs every call through your existing middleware and auth.
- **From the other two proposals:** a one-call path, detail levels and categories in discovery, and forced safe defaults. Their API shapes, transport ownership and v1 SDK were rejected, for reasons below.

Four inputs only you can give, each with a default so work can start, are under **Risks, and what still needs you**.

## How the three proposals compare

**The final plan builds on proposal A, takes four good ideas from B and C, and drops their API shapes.** A was the only one written against the real repo and the current spec. B is a sound survey of patterns with little ts-pf grounding. C is a clear pitch whose code would not type-check or run against a ts-pf app.

The proposals:

- **A**: [@ts-pf/mcp — Design Exploration](https://claude.ai/artifact/BsqvP8MuUGk9XgViQx4z8L) (this session).
- **B**: the agent evaluation that proposes `createTsPfMcp` with path-keyed config and modes.
- **C**: the agent evaluation that proposes `defineMCPWrapper` and `createToolHostServer`.

An independent judge scored them blind, labelled only A/B/C, checking every claim against the repo. It scored each dimension from 1 to 5:

| Dimension | A | B | C | Reason in one line |
| --- | --- | --- | --- | --- |
| Fit with ts-pf rules and naming | 5 | 2 | 1 | B reuses ts-pf wire handlers (forbidden); C owns `listen({ port })` |
| Type-safety realism | 4 | 3 | 2 | C's `mapInput` has no model-facing schema; B's string paths are hand-waved |
| DX, the 5-line case | 3 | 4 | 3 | A has four concepts before the first tool; B and C are one call |
| DX, a 400-RPC contract | 5 | 2 | 2 | A has `all(node)`, toolset `inject`, hosts and an `audit` coverage test |
| LLM-friendly output shaping | 5 | 3 | 3 | Only A checks `outputSchema` and rewrites errors into next steps |
| Tool-host design | 5 | 3 | 2 | C has no read/write split and repeats contract + implementation per host |
| MCP spec, incl. 2026-07-28 | 5 | 2 | 1 | B says "MCP sessions"; C names the v1 SDK and blocking confirmations |
| Security and auth | 4 | 1 | 2 | Only A derives identity from `authInfo` and enforces in middleware |
| Testability | 5 | 2 | 1 | A's toolsets are plain values; `{ list, call }` runs without a transport |
| Scope discipline | 3 | 2 | 3 | A's v1 is too heavy; B's four-mode switch is config sprawl |

**What B and C got right that A missed or undersold:**

- **One call for the simple case** (B, C). A's level 0 has too much ceremony for "stand it up quickly". The final plan adds a one-call path.
- **Discovery over the whole server** (B). A wrongly called this "one global dispatcher" and rejected it. It is simply a tool host whose scope is the entire contract, so the final plan supports it with the same mechanism.
- **Detail levels and categories in discovery** (B's `name | summary | full`, C's categories). These are cleaner than A's "summaries unless `names` is given".
- **Forced safe defaults** (C's `includeAuditLogs: false`). A supports this through `.inject` but never showed it.

**Errors the judge found that the final plan avoids:**

- **A**:
  - It reserved `tool` on the toolkit root while claiming a `tool` slice can't collide.
  - It glossed over recursive schemas and non-object roots for `$ref` inlining and `inject`.
  - It checked only the context type in `bindTools`, not the contract.
  - It labelled a 64-char name cap as if it came from the spec (the spec allows 128).
- **B**:
  - It uses `z.toJSONSchema` instead of ts-pf's `toJsonSchema`, which would break TypeBox and ArkType contracts.
  - It reads descriptions from `.meta()` rather than `docs()`.
  - It reuses message/HTTP handlers.
  - Returning a registered `McpServer` rules out per-caller tool lists.
- **C**:
  - It has no context factory, so auth middleware cannot run.
  - It passes flat string names, so nested routers are lost.
  - `.rename()` plus an object key gives each tool two names.
  - It calls runtime schema checks "type-checked".
  - Its `namespace: 'users'` naming yields `get_user_capabilities` with no rule.

## Decision log

**Twenty decisions are settled, and every one that touches types or the SDK was verified by running code.** "Verified" names the evidence:

- **Type spike:** compiled against the real `@ts-pf/contract` and `@ts-pf/server` dist with strict flags, including must-fail cases.
- **Run:** the end-to-end SDK v2 prototype.
- **Repo:** checked against ts-pf source.
- **Reasoning:** judgment, not code.

| # | Decision | Choice | Why | From | Verified |
| --- | --- | --- | --- | --- | --- |
| 1 | Source of truth | The contract defines tools; an executor (`app` or `client`) only runs them | Answers your contract-vs-implementation TBD without changing a line of tool definitions | A | Repo |
| 2 | API shape | Contract-mirroring toolkit: `tk.user.find.describe(...)` | Property access on a mapped type, like `Implementer`; errors land on the exact line; tools are reusable values. B's path-keyed config never checks a schema against its map; C is A with string paths | A | Type spike |
| 3 | Root members | `$context`, `$toolset`, `$host`, `$tool`, `$coverage`. A contract key starting with `$` at any depth is a type error naming the key | A slice named `tool` or `all` can never collide | Judge | Type spike |
| 4 | Serving API | One function, `createMcpFactory(source, options)` in `./sdk`. `source` is an `app` (one-call path, every procedure exposed) or bound `McpTools` (shaped) | One concept for serving; the app path works because each implemented leaf carries its contract procedure at runtime | B, C, critic | Type spike, Run, Repo |
| 5 | Executors | In-process `{ app, context }` through `runProcedure`, and remote `{ client }`, where `client` may be a function of the caller | Remote is cheap and enables a gateway that calls upstream as the user | A, B, critic | Type spike |
| 6 | Binding checks | `bindTools` infers contract and context from the toolset and checks both against the app | A wrong app or context is a compile error | Spike | Type spike |
| 7 | Tool names | Literal path joined with `_` (`user.listActive` → `user_listActive`); in a toolset, the object key is the name | Literal types at near-zero cost; no `.rename()` double-naming | A | Type spike |
| 8 | Classification | `effect: 'read' \| 'write' \| 'destructive'` from `mcp({ effect })` in the contract, overridable by `.effect()`. **Unclassified = `write`**; `audit()` lists them | Drives annotations, host buckets and `all({ effect })`. Unclassified tools stay out of read-only buckets and never claim to be harmless | A, critic | Type spike |
| 9 | Descriptions | `.describe()` → `mcp({ description })` → `docs().description` → `docs().summary`; empty fails `audit()` | Written once for OpenAPI, codegen and MCP | A, B | Repo |
| 10 | Input shaping | `.inject({ key: fn })` (hidden, server-filled, also forced safe defaults) **or** `.input(schema, map)`; `all(node, { inject })` for bulk, type-checked per field | One validation pass with ts-pf's `validateSchema`; multi-tenant in one line | A, C | Type spike |
| 11 | Output shaping | `.output(map)` or `.output(schema, map)`; mappers get `{ context, info, call }`, where `call` is a typed client for **joins** across procedures | Covers remove/add/format/join; `outputSchema` only with a schema, and results are then checked | A | Type spike, Run |
| 12 | Errors | `.errors({ CODE: fn })` for declared codes; other throws via `toWireError`; `console.error` unless `onError` | Next-step messages; never leak `INTERNAL`; same default as `FetchHandler` | A | Repo |
| 13 | Large contracts | Split into toolsets first; put a group behind a host only above about 15 tools | Flat tools do best on clients that defer tools themselves | A, research | Reasoning |
| 14 | Discovery modes | One mechanism: whole-server discovery is a host over `all(tk)` | One index, dispatch path and pipeline | Judge | Type spike, Run |
| 15 | Host tools | `get_<host>[_<bucket>]_capabilities({ query?, category?, names?, detail?, limit? })` + `call_<host>[_<bucket>]_capability({ name, input })` | Your pseudocode, plus B's detail levels and C's categories | A, B, C | Type spike, Run |
| 16 | Host safety | `split: 'effect'` by default: `query` (read) and `operations` (write + destructive). Bucket names are fixed in v1 | Keeps approval prompts and `destructiveHint` meaningful | A | Type spike, Run |
| 17 | Drift detection | Compile errors at each tool, plus `tk.$coverage({ toolsets, exclude })`, which counts host tools | A new procedure fails the build until someone decides | A | Type spike |
| 18 | Transport | SDK v2 owns it; a fresh `McpServer` per request with passthrough schemas | About 0.6 ms per request at 400 tools; a shared instance fails under concurrency | Prototype | Run |
| 19 | Resources and prompts | Not in v1; reads stay tools | Cursor shows no resource support; elsewhere they are mostly user-attached | B, C rejected | Reasoning |
| 20 | Package | One `@ts-pf/mcp` with `./meta` (no deps), root, and `./sdk` (peer SDK `>=2.4.0 <3`) | Contract files import only `./meta`, so no server code reaches client bundles | A | Repo |

The type cost of the whole design, measured on a 400-procedure fixture, is about +1.0 s check time and +0.7M instantiations over the contract and app alone (2.81 s vs 1.77 s). It covers:

- 20 shaped tools
- `all()` with typed `inject`
- three split hosts
- name-collision checks
- `$coverage`
- `bindTools` and both `createMcpFactory` forms

## Final API, end to end

**Four steps, each optional after the first: serve, classify in the contract, shape tools, compose toolsets.** Every snippet below matches code that compiled in the type spike or ran in the prototype.

### 1. One call (small contracts)

```ts
// mcp.ts
import { createMcpFactory } from '@ts-pf/mcp/sdk'
import { app } from './server.js'

export const factory = createMcpFactory(app, {
  name: 'planets',
  version: '1.0.0',
  context: (info) => ({ db, user: userFromAuth(info.authInfo) }), // typed as app's $context; required for impl.router() apps
})
// serveStdio(factory) or createMcpHandler(factory).fetch(req, { authInfo })
```

Every procedure is exposed with default names, descriptions and annotations; `docs({ hidden: true })` procedures are skipped. Options for the app form: `{ name, version, instructions?, listTtlMs?, context, onError?, maxResultChars?, interceptors? }`. The call-pipeline options (`onError`, `maxResultChars`, `interceptors`) act inside `McpTools.call`, so they belong to `bindTools`' executor (`{ app, context, interceptors?, onError?, maxResultChars? }` / `{ client, onError?, maxResultChars? }`); the app form forwards them, and the McpTools form takes only `{ name, version, instructions?, listTtlMs? }`. Multi-tenant contracts, where fields like `tenantId` must be hidden from the model, use step 3.

### 2. Classify and describe in the contract (optional, shared)

```ts
// contract.ts imports only the dependency-free ./meta entry
import { mcp } from '@ts-pf/mcp/meta'
import { docs } from '@ts-pf/docs'

find: procedure
  .input(z.object({ tenantId: z.string(), id: z.string() }))
  .output(UserRecord)
  .errors({ NOT_FOUND: { status: 404, data: z.object({ id: z.string() }) } })
  .meta({ ...docs({ description: 'Find a user by id' }), ...mcp({ effect: 'read' }) }),
```

`mcp()` uses a `const` type parameter so `effect` stays a literal; that is what lets `all(node, { effect: 'read' })` filter at the type level. Unclassified procedures count as `write`.

### 3. Shape tools for the model

```ts
import { createToolkit, all } from '@ts-pf/mcp'
import type { AppCtx } from './server.js'

const tk = createToolkit(contract).$context<AppCtx>()

const findUser = tk.user.find
  .describe('Get one user by id. If you only have a name or email, call user_search first.')
  .inject({ tenantId: ({ context }) => context.tenantId })     // removed from the model's schema
  .output(
    z.object({ id: z.string(), name: z.string(), team: z.string(), active: z.boolean() }),
    async (u, { call, context }) => {                          // call: typed client on the same executor
      const team = await call.team.find({ tenantId: context.tenantId, id: u.teamId }) // join
      return { id: u.id, name: `${u.firstName} ${u.lastName}`, team: team.name, active: u.deletedAt === null }
    },
  )
  .errors({ NOT_FOUND: ({ data }) => `No user with id ${data.id}. Use user_search to find ids.` })
  .examples([{ id: 'usr_123' }])

const exportAudit = tk.audit.export
  .effect('write')
  .inject({ includePii: () => false })                        // forced safe default

const onboardUser = tk.$tool({                                // composite N→1 tool
  description: 'Invite a user by email and add them to a team in one step.',
  effect: 'write',
  input: z.object({ email: z.string().email(), team: z.string() }),
  run: async ({ input, call }) => {
    const team = await call.team.findByName({ name: input.team })
    const user = await call.user.invite({ email: input.email })
    await call.team.addMember({ teamId: team.id, userId: user.id })
    return `Invited ${user.email} to ${team.name}.`
  },
})
```

| Builder method | Model sees | Typed against |
| --- | --- | --- |
| `.describe(text)` | Description | — |
| `.effect('read' \| 'write' \| 'destructive')` | `read` → `readOnlyHint: true`; `write` → `readOnlyHint: false, destructiveHint: false`; `destructive` → `destructiveHint: true` | A literal union; `.kind()` does not exist |
| `.inject({ key: fn })` | Keys removed from `inputSchema`, filled per call | Keys of the procedure input ("Did you mean `tenantId`?" on typos); a distributive `Omit`, so unions keep working |
| `.input(schema, map)` | A new input schema | `map` must return the procedure input; exclusive with `.inject` (a literal error message explains why) |
| `.output(map)` / `.output(schema, map)` | A reshaped result; `outputSchema` only with `schema` | `map(out, { context, info, call })`: `out` is the procedure output, `call` a typed client for joins; the return (sync or async) must match `schema` |
| `.errors({ CODE: fn })` | An `isError` text naming the next step | Declared codes only; `data` typed per code |
| `.examples([...])` | Appended to the description, or returned by hosts | The model-facing input |

### 4. Compose toolsets, check coverage, bind, serve

```ts
import { bindTools } from '@ts-pf/mcp'
import { createMcpFactory } from '@ts-pf/mcp/sdk'

export const usersMcp = tk.$toolset({
  tools: [
    all(tk.user, { exclude: [tk.user.find], inject: { tenantId: ({ context }) => context.tenantId } }),
    { user_find: findUser, user_onboard: onboardUser },       // a duplicate name is a type error
  ],
})

tk.$coverage({ toolsets: [usersMcp, adminMcp], exclude: [tk.internal, tk.admin.purgeTenant] })
// error: "admin.flags" is not exposed by any toolset nor excluded

const tools = bindTools(usersMcp, { app, context: (info) => ({ db, tenantId: tenantFrom(info.authInfo) }) })
export const factory = createMcpFactory(tools, { name: 'users', version: '1.0.0', instructions: '…' })
```

- **Remote form:** `bindTools(usersMcp, { client })`, where `client` is `createClient<typeof contract>(new FetchLink({ url }))` or `(info) => clientFor(info.authInfo)`. Mappers and `inject` still see `context`, so the client form also takes `context: (info) => Ctx`, required when the toolkit has `$context<C>()` with required keys (`{}` otherwise).
- **Without MCP:** `tools.list(info)` and `tools.call(name, args, info)` work in tests and in your agent framework.

### Type-level rules the spike established

- A tool carries a **required** runtime brand `'~tool'` (path, context, model input). An optional phantom can't tell a tool from a plain object.
- Mapper generics use a default type parameter (`.input`) and a constrained return parameter (`.output`). Written naively, 20 shaped tools cost about 4× the type instantiations (2.0M vs 0.6M).
- `ToolBuilder` carries the contract type so mapper `call` is typed. The cost is long error text on name collisions; shortening it (a `Register`-style interface) is a v1.1 polish item.
- Literal unions in `.output` returns need `as const`, the same as any TypeScript return check.

## Large contracts: splitting, tool hosts and discovery

**For 400 procedures: one toolset per concern, flat when a toolset has about 15 tools or fewer, a tool host when a group stays bigger, and a whole-contract host only as the last resort.** All three use the same pieces.

### Rules of thumb

| Situation | Do | Model sees |
| --- | --- | --- |
| A concern with ≤ 15 tools | Flat toolset | Each tool by name |
| A concern that stays above 15 | `tk.$host` over that node, pinning the 3–5 hot tools as flat | Hot tools + 2 or 4 host tools |
| Many concerns, one server | One host per concern in one toolset | 2–4 tools per concern |
| Weak client, huge contract, no curation yet | One host over `all(tk)` (whole-server discovery) | 2–4 tools total |
| Client defers tools itself (Claude Code, OpenAI tool search) | Prefer flat toolsets with excellent descriptions | Whatever the client loads |

The 15-tool line is a heuristic from the research: about 5–8 per server per WorkOS, and selection accuracy falling from about 20–30 tools. `audit()` warns above it; nothing switches automatically.

### Splitting is a property access

```ts
const tenant = { tenantId: ({ context }: { context: AppCtx }) => context.tenantId }

export const billingMcp = tk.$toolset({ tools: all(tk.billing, { effect: 'read', inject: tenant }) })
export const usersMcp   = tk.$toolset({ tools: [all(tk.user, { inject: tenant }), { user_onboard: onboardUser }] })
```

`all(node, { effect?, tags?, exclude?, inject? })` selects tools, then applies the rest:

- **Selection:** by classification (one effect or an array) and `docs()` tags. Procedures marked `docs({ hidden: true })` are skipped.
- **`inject`:** each key goes only to tools whose input has it, which covers multi-tenant contracts in one line. It is type-checked against the selected procedures. A typo fails with "`tenantID` is not an input field of any selected procedure". A type conflict names the offending path, e.g. "Injected `tenantId` does not fit field `legacy.report.tenantId`", and the fix is to exclude that procedure.
- **Re-injecting** an injected key on a tool is a type error, so `inject` settings can never silently overlap.

### Tool hosts: one mechanism for every size

```ts
export const adminMcp = tk.$toolset({
  tools: { admin_overview: tk.admin.stats },               // pinned flat tool
  hosts: {
    admin: tk.$host({
      description: 'Tenant administration: billing adjustments, audit log, feature flags, user moderation.',
      tools: all(tk.admin, { exclude: [tk.admin.stats], inject: tenant }),
      // split: 'effect' is the default
    }),
  },
})
```

That lists exactly five MCP tools:

| Tool | Holds | Annotations |
| --- | --- | --- |
| `admin_overview` | Pinned tool | Its own |
| `get_admin_query_capabilities` | Discovery over `read` tools | `readOnlyHint: true` |
| `call_admin_query_capability` | Runs a `read` tool | `readOnlyHint: true` |
| `get_admin_operations_capabilities` | Discovery over `write` and `destructive` tools | `readOnlyHint: true` |
| `call_admin_operations_capability` | Runs a `write` or `destructive` tool | `destructiveHint` when any inner tool is destructive |

Your unsplit `users-mcp` example is `hosts: { users: tk.$host({ description: 'User accounts and profiles.', tools: all(tk.user), split: false }) }`, which gives `get_users_capabilities` / `call_users_capability`.

- **Names** come from the host key exactly, so `users` stays `users` (C's naming had no rule).
- **`description`** is required, because it is what the model reads before searching.
- **Collisions:** a flat tool, another host or an inner tool that collides with a generated name is a type error.
- **Whole-server discovery** is `hosts: { api: tk.$host({ description, tools: all(tk) }) }`.

**`get_*_capabilities` input** (all optional):

- `query`: BM25 ranking over name, description, tags and `mcp()` aliases.
- `category`: the first path segment under the host node (e.g. `billing`, `flags`).
- `names`: exact tools.
- `detail`: `'name' | 'summary' | 'full'`, default `summary`; `full` adds input schema and examples.
- `limit`: default 5.

**It returns:**

```json
{ "scope": "admin_query", "total": 37, "categories": ["audit", "billing", "flags"],
  "tools": [{ "name": "audit_search", "description": "Search the audit log by actor, action or date.", "effect": "read" }] }
```

The tool's own description lists the inner names when there are 30 or fewer, otherwise the categories, so the model sees the catalog's shape before searching.

**`call_*_capability` behavior:**

- Input is `{ name, input }`; `name` is an `enum` of inner names (capped at 100, then plain string).
- An unknown inner name returns `isError` listing valid names. The prototype shows `Unknown capability "planet_nuke". Valid: planet_rename, planet_delete`.
- Invalid input returns `isError` with the issues and that tool's schema, so the model repairs in one turn.
- Inject, mappers, errors and middleware run exactly as for a flat tool. Interceptors see the procedure path; the tool name is on `onError` and on `McpCallInfo.tool`.

**Accepted costs:**

- Hosts take 2–3× more model turns (Speakeasy measured this at 40–400 tools, with 96% fewer input tokens).
- The 2026-07-28 `Mcp-Name` header shows only the outer tool, so gateways cannot meter inner operations.
- Hosts are opt-in per group for both reasons.

## Serving, auth, safety and operations

**`@ts-pf/mcp/sdk` builds a fresh SDK v2 `McpServer` for each request from precomputed tool definitions. Passthrough schemas keep our single validation pass and our error messages.** This adapter was run end to end against `@modelcontextprotocol/server@2.4.0` and the v2 client. It covered HTTP and stdio, each in both protocol eras: 2026-07-28 and the 2025 legacy fallback.

```ts
// @ts-pf/mcp/sdk: the core of createMcpFactory (the McpTools form, as run in the prototype)
const passthrough = (s: Json): StandardSchemaWithJSON => ({ '~standard': { version: 1, vendor: 'ts-pf',
  validate: (value: unknown) => ({ value }), jsonSchema: { input: () => s, output: () => s } } })

export const createMcpFactory = (tools: McpTools, o: McpFactoryOptions): McpServerFactory =>
  async ({ authInfo, requestInfo, era }) => {
    const server = new McpServer({ name: o.name, version: o.version }, {
      instructions: o.instructions,
      cacheHints: { 'tools/list': { ttlMs: o.listTtlMs ?? 0, cacheScope: 'private' } },
    })
    for (const d of await tools.list({ authInfo, requestInfo, era }))       // only what this caller may see
      server.registerTool(d.name, {
        description: d.description, annotations: d.annotations,
        inputSchema: passthrough(d.inputSchema),                            // advertised, never re-validated by the SDK
        outputSchema: d.outputSchema && passthrough(d.outputSchema),
      }, (args, ctx) => tools.call(d.name, args, {
        authInfo: ctx.http?.authInfo ?? authInfo, requestInfo: ctx.http?.req,
        signal: ctx.mcpReq.signal, inputResponses: ctx.mcpReq.inputResponses, era,
      }))
    return server
  }
// HTTP:  createMcpHandler(factory).fetch(req, { authInfo: await verifyBearer(req) })
// stdio: serveStdio((ctx) => factory({ ...ctx, authInfo: envAuth }))
```

**What the end-to-end run showed:**

| Scenario | Result |
| --- | --- |
| `tools/list` for a user vs an admin (v1.1 visibility, prototyped) | User sees 3 tools; admin also sees the operations host pair. The raw response carries `ttlMs` and `cacheScope: 'private'` |
| Invalid arguments | Our message is returned: `Invalid input for planet_find: data/id must be integer` plus the expected schema |
| Unknown inner capability | `Unknown capability "planet_nuke". Valid: planet_rename, planet_delete` |
| Hidden or unknown tool | Protocol error `-32602 Tool … not found` |
| Tool with `outputSchema` | `structuredContent` accepted by the v2 client |
| (v1.1) Destructive confirm, 2026-07-28 (HTTP, stdio) | `inputRequired` round trip, then the call runs |
| (v1.1) Destructive confirm, legacy (HTTP, stdio) | `isError` asking to retry with `"confirmed": true` after the user agrees; the retry runs |

**Per-request cost.** 200 requests after warm-up, admin caller:

| Server shape | Factory p50 / p95 | `tools/list` end to end p50 / p95 | `tools/call` end to end p50 / p95 |
| --- | --- | --- | --- |
| 400 flat tools | 0.61 / 4.72 ms | 3.01 / 8.84 ms | 1.24 / 6.23 ms |
| 4 hosts (8 tools) | 0.02 / 0.03 ms | 0.26 / 0.48 ms | 0.27 / 0.43 ms |

No server caching is needed. Reusing one instance fails as soon as two requests overlap; the SDK says "Return a new instance for each request." `bindTools` precomputes definitions, JSON Schemas and the BM25 index once, so the factory only filters and registers.

**Facts the design rests on** (checked in the 2.4.0 type definitions and runs):

- `createMcpHandler(factory)` returns `{ fetch(req, { authInfo }), close, notify, bus }` and calls the factory per request with `{ era, authInfo?, requestInfo? }`.
- `serveStdio` is imported from `@modelcontextprotocol/server/stdio`, calls the factory per connection and never sets `authInfo`.
- `registerTool` would re-validate and replace our messages without the passthrough schema.
- The v2 client rejects `structuredContent` that does not match `outputSchema`, so tools advertise it only when they check it.
- The low-level `Server` is deprecated and is not used.
- The v2 client defaults to the 2025 protocol, so tests set `versionNegotiation: { mode: 'auto' }`.

**Context and auth.**

- `context: (info) => TCtx` runs once per call, which suits the stateless 2026-07-28 spec.
- Over HTTP, identity comes from `info.authInfo` (`{ token, clientId, scopes, expiresAt? }`), filled by your `verifyBearer` or the SDK's OAuth helpers. Raw `Authorization` and `Cookie` headers are never forwarded.
- For a remote gateway, `client` may be a function of `info`, so upstream calls carry the caller's identity: `bindTools(toolset, { client: (info) => clientFor(info.authInfo) })`.
- Enforcement stays in procedure middleware. Hiding tools and annotations are hints, not security.

**Destructive actions, three layers:**

1. `effect: 'destructive'` sets `destructiveHint`, so clients that prompt per tool ask first. Hosts are split by effect, so the operations host carries the hint.
2. Middleware enforces role and scope, exactly as over HTTP.
3. (v1.1) `confirm: true` asks for a human yes through `inputRequired`, which works on 2026-07-28 connections (HTTP and stdio). On legacy connections (HTTP and stdio) it falls back to the `confirmed: true` retry, and `audit()` notes the weaker guarantee. Detection uses the factory's `era`.

**Operations.**

- Server `CallInterceptor`s pass straight to `runProcedure`, so existing logging and tracing keep working. Interceptors see the procedure path; the tool name is on `onError` and on `McpCallInfo.tool` (the inner tool for host calls), so a project that wants tool-level tracing copies it into its own context type in `context: (info) => …`.
- Unknown throws go through `toWireError` (no `INTERNAL` leaks) and are logged with `console.error` unless `onError` is given, the `FetchHandler` default.
- Text results are capped at `maxResultChars` (default 25,000) with a truncation note.
- Tests call `tools.call(name, args, info)` in Vitest, or go end to end through `createMcpHandler(...).fetch` and the v2 `Client`, as the prototype does.

## Package shape and v1 scope

**One package, three entry points, ten public names. v1 covers everything you asked for; per-caller visibility, confirmations and the extras follow in v1.1 and later.**

```
@ts-pf/mcp/meta  → no dependencies (mcp() only; safe in contract files)
@ts-pf/mcp       → contract + docs (toJsonSchema, getDocs) + server (runProcedure, lookupProcedure) + protocol (toWireError)
@ts-pf/mcp/sdk   → @ts-pf/mcp + peer @modelcontextprotocol/server >=2.4.0 <3
```

| Export | Entry | Role |
| --- | --- | --- |
| `mcp({ effect, description, aliases })` | `./meta` | Contract-level hints, merged into `.meta()` like `docs()` |
| `createToolkit(contract)` | root | Typed tool builders; root members `$context`, `$tool`, `$host`, `$toolset`, `$coverage` |
| `all(node, options?)` | root | Default tools for every procedure under a node, with filters and `inject` |
| `bindTools(toolset, executor)` | root | `{ app, context }` or `{ client }` → `McpTools { list, call }` |
| `audit(toolsets, options?)` | root | Runtime lint for CI (descriptions, classification, schema roots, size, names) |
| `McpTools`, `McpCallInfo`, `McpToolDefinition`, `McpToolResult` | root | Types |
| `createMcpFactory(source, options)` | `./sdk` | Per-request `McpServer` factory from an `app` or from `McpTools` |

`McpCallInfo` is `{ authInfo?, requestInfo?, signal?, inputResponses?, era?, tool? }`. `era` (`'legacy' | 'modern'`) comes from the SDK factory context. `tool` (`{ name, path }`) is set by `McpTools.call` before `context` runs: the tool's name and procedure path (for a host call, the inner tool's), so a project can copy it into its context type for interceptors.

**v1: in or out**

| Capability | v1 | Later |
| --- | --- | --- |
| Toolkit, builder methods (`describe`, `effect`, `inject`, `input`, `output`, `errors`, `examples`) | In | — |
| `$tool` composite tools, `all()` with filters and `inject` | In | — |
| `$toolset` with type-level duplicate check, `$coverage` | In | — |
| `$host` with `split`, BM25, `category`, `detail` | In | Pluggable `search` (embeddings) in v1.1 |
| `bindTools` for `app` and `client`; `createMcpFactory (app or McpTools)` | In | — |
| `audit()`: unclassified, missing descriptions, schema roots, more than 15 tools, names over 60 chars (our soft limit for Cursor; the spec allows 128). Coverage lives only in $coverage | In | Token estimates in v1.1 |
| `maxResultChars` truncation, `onError`, interceptors | In | — |
| `.visible()` per-caller tool lists | — | v1.1 (the factory already supports it) |
| `confirm: true` via `inputRequired` with fallback | — | v1.1 |
| `.title()`, `.text()`, custom host name templates | — | v1.1 |
| Streams (collect + progress), file inputs | — | v2 |
| Resources and prompts | — | v2, if client support improves |
| Code mode (`search` + `execute` in a sandbox) | — | Separate package, spike only |
| Per-client schema `compat` profiles | — | Only if a real client breaks |

Suggested files, one job each:

- `meta.ts`
- `toolkit.ts` (builder, `all`)
- `toolset.ts` (`$toolset`, `$host`, `$tool`, `$coverage` types)
- `schema.ts` (model-facing JSON Schema)
- `search.ts` (BM25)
- `bind.ts`
- `audit.ts`
- `sdk.ts`

The repo checklist applies: a `skills/ts-pf-mcp/SKILL.md`, the README `## API` list, a changeset, and an `examples/mcp` smoke test that runs the v2 client in-process.

## Ideas rejected, and why

| Idea | From | Why not |
| --- | --- | --- |
| Config object keyed by string path (`tools: { 'planet.find': {...} }`) | B | The spike showed a plain mapped config never checks `output.map` against `output.schema`; the checked variant gives unreadable errors. No tool reuse across servers |
| Callback builder with `builder.procedure('name')` and `.rename()` | C | Same power as the toolkit with string paths (no go-to-definition or rename-refactor); `.rename()` plus the object key gives a tool two names |
| `mode: 'direct' \| 'toolhost' \| 'progressive' \| 'hybrid'` switch | B | A config-bag switch is sprawl; hosts are composed per group instead, and whole-server discovery is just a host |
| Separate `search_tools` / `get_tool_details` / `call_tool` mechanism | B | Duplicates the host pipeline; available as `$host({ tools: all(tk) })`, with custom names in v1.1 |
| `createToolHostServer({ namespace, contract, implementation, categories })` | C | Repeats contract and implementation per host; hand-listed string categories drift from the contract; no read/write split |
| `server.listen({ transport, port })` | C | Not a real SDK API; ts-pf rules say the user owns listen. SDK v2 provides `serveStdio` and `createMcpHandler` |
| Build on `@modelcontextprotocol/sdk` (v1) | C | v1 tops out at protocol 2025-11-25 and has no `createMcpHandler` |
| Return a statically registered `McpServer` | B | Rules out per-caller lists; v2 serves through a per-request factory anyway |
| Low-level `Server` adapter | A's revision | Marked deprecated; the per-request `McpServer` with passthrough schemas does the same job |
| `z.toJSONSchema()` for schemas | B | Breaks TypeBox and ArkType contracts; ts-pf's `toJsonSchema` already covers all adapters |
| Reuse ts-pf message/HTTP handlers for MCP | B | MCP is JSON-RPC 2.0, not ts-pf frames; the repo rules forbid repurposing them |
| Read procedures as MCP resources by default | B, C | Cursor shows no resource support; Claude Code reads them only through extra built-in tools; elsewhere resources are user-attached. Tools are the reliable path |
| `mapInput` over the procedure input | C | The model still sees every field, including the "forced" one; `.inject` removes it from the schema |
| Embeddings as the default search | B, C | Adds a model dependency and 50–200 ms per query; BM25 gives about 87–90% top-5 at under 1 ms |
| Automatic switch to hosts above N tools | Stainless pattern | Behavior would change silently when a procedure is added; `audit()` warns and the developer decides |
| Code generation of a second contract for MCP | Considered in A | Duplicate code that drifts, which is the problem you want to avoid |

## Risks, and what still needs you

**Needs your input (defaults in brackets, so work can start without waiting):**

1. **First real target.** Which contract proves v1: THERMS, or a smaller product? This sets the fixture for the audit and coverage gate. \[THERMS, if one slice is around 50–100 procedures\]
2. **Remote gateway.** Do you plan a standalone MCP service in front of an existing API? If not, `{ client }` binding stays in v1 but is not tested against production auth first. \[In v1, lightly tested\]
3. **Description ownership.** Will contract authors keep `docs()` descriptions up to date, or does the MCP layer own them? This only changes the `audit()` default severity. \[`docs()` first; missing description = audit error\]
4. **Agent framework.** Should your AI framework consume `McpTools` directly as its tool source for ts-pf procedures? If yes, `McpCallInfo` should be agreed with that framework now. \[Yes\]

**No architecture question is left open. Four inputs only you can give would sharpen v1, and five residual risks each have a named mitigation.**

**Residual risks and mitigations:**

| Risk | Mitigation |
| --- | --- |
| Recursive schemas and `allOf` / union roots break `$ref` inlining and `inject` key removal | Detect in `schema.ts`; `audit()` names the tool and suggests `.input(schema, map)` |
| Long type errors on name collisions and bad bindings, because builders carry the contract type | Messages are literal and specific, just long. v1.1 tries a `Register`-style interface and keeps it only if mapper `call` stays typed |
| `ContractBuilder.meta()` widens nested literals | The `mcp()` helper uses a `const` type parameter. Optionally ask `@ts-pf/contract` to make `.meta()` `const` too |
| Confirmations on legacy (2025) connections rely on the model honoring the `confirmed: true` retry | v1.1; middleware still enforces role and scope, and `audit()` flags tools that depend on it |
| The MCP grouping standard (Progressive Disclosure WG) may define its own shape | All host logic lives behind `$host` in one module, so re-mapping is local |

## Roadmap

&#91;embedded content: roadmap · 3 phases, 2 gates\]

The first v1 task is to move the two spikes into `packages/mcp`: the typed API from `spike/src/mcp2.ts` and the adapter from `mcp-spike/combined.ts`. They already cover the hardest parts. The v1 gate is one real contract passing `$coverage`, `audit()` and the end-to-end suite on both protocol eras, within the measured type budget (about +1 s at 400 procedures). v2 items wait for client support or the MCP grouping standard.

## Review trail

**Six independent passes over two rounds. Each pass changed the plan, and nothing in the decision log rests on a single agent's opinion.**

| Pass | Who | What it found | What changed |
| --- | --- | --- | --- |
| 1 | Blind judge (A/B/C only) | A strongest on 8 of 10 dimensions; B and C had real ideas and real errors | One-call path, whole-server discovery as a host, detail levels and categories, `$`-prefixed members |
| 2 | Type spike, round 1 | The toolkit API compiles against real ts-pf types; one mapper pattern cost 4× type instantiations | Fixed mapper generics; required `'~tool'` brand; B's config can't check schema vs map |
| 3 | SDK prototype, round 1 | The low-level `Server` is deprecated; per-request `McpServer` + passthrough works; confirm needs a fallback on legacy connections | Adapter rebuilt on `McpServer`; confirm fallback; resources dropped from v1 |
| 4 | Critic | Serving sketch not run as a whole; field joins dropped; visibility in and out of v1; unclassified undefined; three serving names | Joins via mapper `call`; unclassified = write; one `createMcpFactory`; per-caller `client`; coverage only in `$coverage` |
| 5 | Type spike, round 2 | Hosts, name collisions, coverage across hosts, typed bulk `inject`, joins and both factory forms all compile; +1.0 s at 400 procedures | `const` `mcp()` helper; required host `description`; inject precedence settled |
| 6 | SDK prototype, round 2 | The combined adapter passes every scenario on HTTP and stdio in both eras; 0.6 ms per request at 400 tools; shared servers fail | No server caching; `era` added to `McpCallInfo` |

A final sign-off review checked the finished doc for consistency and evidence before hand-off.

## Sources

Proposals and evidence:

- Proposal A: [@ts-pf/mcp — Design Exploration](https://claude.ai/artifact/BsqvP8MuUGk9XgViQx4z8L)
- Proposals B and C: the two agent evaluations you shared on Oct 25, 2026
- ts-pf repository at commit `9d310c3` ([GitHub](https://github.com/crobinson42/ts-pf))
- Typing spike and SDK prototype: built in this session against the real `@ts-pf/contract` / `@ts-pf/server` dist and `@modelcontextprotocol/server@2.4.0` / `@modelcontextprotocol/client@2.4.0`. Files are in the session workspace (`spike/`, `mcp-spike/`) and can be shared on request.

MCP and SDK:

- [MCP 2026-07-28 release post](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [MCP spec 2025-11-25 — Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP Progressive Disclosure WG](https://modelcontextprotocol.io/community/working-groups/progressive-disclosure)
- [SDK v2 migration guide](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2)
- [SDK v2 `createMcpHandler`](https://ts.sdk.modelcontextprotocol.io/v2/api/@modelcontextprotocol/server/server/createMcpHandler.html)
- [SDK v2 `serveStdio`](https://ts.sdk.modelcontextprotocol.io/v2/api/@modelcontextprotocol/server/server/serveStdio.html)
- [SDK v2 tools](https://ts.sdk.modelcontextprotocol.io/v2/servers/tools)

Client support for resources:

- [Cursor forum: MCP resource support](https://forum.cursor.com/t/cursor-mcp-resource-feature-support/50987.md)
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
- [Claude Code issue 11292](https://claudeissues.com/issue/11292-bug-mcp-http-server-resources-not-accessible-via-listmcpresourcestool-and-readmc)

Tool selection research (vendor-reported where noted):

- [WorkOS — Designing an MCP server from a REST API](https://workos.com/blog/designing-mcp-server-from-rest-api)
- [Glassbead — Toolhost pattern](https://glassbead-tc.medium.com/design-patterns-in-mcp-toolhost-pattern-59e887885df3)
- [Stainless — From API to MCP](https://www.stainless.com/blog/from-api-to-mcp-a-practical-guide-for-developers/)
- [lirantal — awesome-mcp-best-practices](https://github.com/lirantal/awesome-mcp-best-practices/blob/main/README.md)
- [Speakeasy — Dynamic toolsets v2](https://www.speakeasy.com/blog/how-we-reduced-token-usage-by-100x-dynamic-toolsets-v2) (vendor)
- [StackOne — BM25 / TF-IDF tool search](https://www.stackone.com/blog/mcp-tool-search-bm25-tfidf-hybrid/) (vendor)
- [Anthropic — Advanced tool use](https://anthropic.com/engineering/advanced-tool-use)
- [RAG-MCP (arXiv 2505.03275)](https://arxiv.org/html/2505.03275v1)
