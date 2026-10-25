---
name: ts-pf-mcp
description: Use when exposing a ts-pf contract as MCP tools for LLM clients — one-call serving, shaping tools for the model, toolsets, tool hosts, coverage, or serving over HTTP / stdio with the MCP SDK v2. Triggers: @ts-pf/mcp, MCP, Model Context Protocol, createToolkit, createMcpFactory, bindTools, all(), $toolset, $host, $coverage, mcp({ effect }), audit().
---

# @ts-pf/mcp

A typed projection of a ts-pf contract into MCP tools. The contract defines the tools; an executor (`{ app, context }` in-process through `runProcedure`, or `{ client }`) runs them; `@modelcontextprotocol/server` v2 serves them.

Install: `npm i @ts-pf/mcp @modelcontextprotocol/server` (peer **>=2.3.0 <3**, needed for `./sdk` only; keep a single copy in the app). The app already has `@ts-pf/contract` and `@ts-pf/server`; add `@ts-pf/docs` to import `docs()` in contract files.

Link for agents: `npx skills experimental_sync -y`

## Do

Small contract: one call. Every procedure is a tool named by path with `_` (`planet.find` → `planet_find`); `docs({ hidden: true })` is skipped. `context` is typed from the app's `$context<C>()` and required for a branded app.

```ts
import { createMcpFactory } from '@ts-pf/mcp/sdk'

export const factory = createMcpFactory(app, { name: 'planets', version: '1.0.0' })
```

Classify and describe in the contract. Contract files import only `@ts-pf/mcp/meta` (no dependencies). Unclassified = `write`.

```ts
import { procedure } from '@ts-pf/contract'
import { docs } from '@ts-pf/docs'
import { mcp } from '@ts-pf/mcp/meta'
import { z } from 'zod'

export const find = procedure
  .input(z.object({ id: z.number() }))
  .meta({ ...docs({ description: 'Find a planet by id' }), ...mcp({ effect: 'read' }) })
```

Shape for the model with the toolkit; split into toolsets; enforce coverage; bind; serve.

```ts
import { all, bindTools, createToolkit } from '@ts-pf/mcp'
import { createMcpFactory } from '@ts-pf/mcp/sdk'
import { contract } from './contract.js'

const tk = createToolkit(contract) // .$context<AppCtx>() to type context in inject / mappers

const findPlanet = tk.planet.find
  .describe('Get one planet by id. Call planet_list first if you only have a name.')
  .errors({ NOT_FOUND: ({ data }) => `No planet ${data.id}. Call planet_list for ids.` })

export const planetsMcp = tk.$toolset({
  tools: [all(tk.planet, { exclude: [tk.planet.find] }), { planet_find: findPlanet }],
})
tk.$coverage({ toolsets: [planetsMcp] })

export const tools = bindTools(planetsMcp, { app, context: () => ({ db }) })
export const factory = createMcpFactory(tools, { name: 'planets', version: '1.0.0' })
```

- In a toolset the object key is the tool name. Duplicates and collisions with generated host names are type errors naming the key.
- `.inject({ tenantId: ({ context }) => context.tenantId })` removes the key from the model's schema and fills it per call (also forced safe defaults: `.inject({ includePii: () => false })`). Injected values win over anything the model sends. `all(node, { inject })` applies a key only where the input has it; a typo or a conflicting field type is a compile error naming the path.
- `.input(schema, map)` replaces the model input; it is exclusive with `.inject` (inject inside the map).
- `.output(map)` reshapes; `.output(schema, map)` also advertises `outputSchema`, returns `structuredContent`, and checks the result (a mismatch is `INTERNAL`). Mapper `call` is a typed client on the same executor, for joins. Literal unions in a mapper return need `as const`.
- `all(node, { tags: ['billing'] })` and `docs({ hidden: true })` filter in the types when the contract writes them as literals; a widened `string[]` keeps the tool in the type (runtime `$coverage` still checks).
- `.errors({ CODE: ({ data }) => 'next step' })` for declared codes only. `VALIDATION` returns the issues plus the model-facing schema. Unknown throws are `INTERNAL: Internal server error` (via `toWireError`) and logged with `console.error` unless `onError` is set.
- More than about 15 tools in a group: `tk.$host({ description, tools: all(tk.admin) })`. `split: 'effect'` (default) gives `get_admin_query_capabilities` / `call_admin_query_capability` (read) and `get_admin_operations_capabilities` / `call_admin_operations_capability` (write + destructive); `split: false` gives `get_admin_capabilities` / `call_admin_capability`. Pin hot tools flat beside the host. Whole-server discovery is one host over `all(tk)`.
- `tk.$coverage({ toolsets, exclude })` is a compile error (and a runtime throw) naming every procedure no toolset exposes and no `exclude` names. Hosts count; `$tool` composites do not; `docs({ hidden: true })` counts as decided at runtime (and in types when written literally).
- `audit(toolsets)` in CI: missing descriptions (error), unclassified tools, schema roots (unions, recursion, non-object), more than 15 tools, names over 60 characters.
- Identity comes from `info.authInfo` (HTTP: your verified token passed to `createMcpHandler(factory).fetch(req, { authInfo })`). stdio never sets it: `serveStdio((ctx) => factory({ ...ctx, authInfo }))`, with `serveStdio` from `@modelcontextprotocol/server/stdio`. Enforce roles in procedure middleware; annotations and `docs({ hidden: true })` are hints, not security.
- OAuth over HTTP: check the token in the SDK at the HTTP edge, so a missing or bad token is a `401` challenge and the client can start sign-in. Map claims to the app's context in `context`. A gateway calling upstream as the user uses `client: (info) => createClient(…)` (built once per tool call, shared with mapper `call`). Full verifier and metadata setup: the package README, "OAuth".
- Per-caller lists: `.visible((info) => boolean)` on a tool, `all(node, { visible })`, `$tool({ visible })`, `$host({ visible })`. The predicate gets `McpCallInfo` (not `context`); a hidden tool is left out of `tools/list` and a call to it answers like an unknown tool; host discovery, the `get_*` description, the `call_*` enum and annotations follow the caller's visible set.
- Scope step-up: `.scopes(['admin'])` (also `all` / `$tool`). Over HTTP a token missing one gets `403 insufficient_scope` (granted ∪ required scopes) before the call runs, and the client re-consents; a host's `call_*` challenges per inner tool (never one hidden from the caller). Toolkit only: `createMcpFactory(app, …)` declares no scopes. A non-OAuth scope string throws a `TypeError` at build time. No token, stdio, and `tools.call()` never challenge, so middleware still enforces. Hide a tool or step up into it, not both.

```ts
import { createMcpHandler, getOAuthProtectedResourceMetadataUrl, type OAuthMetadata, type OAuthTokenVerifier, oauthMetadataResponse, requireBearerAuth } from '@modelcontextprotocol/server'
import { createMcpFactory } from '@ts-pf/mcp/sdk'
import { PFError } from '@ts-pf/protocol'

declare const verifier: OAuthTokenVerifier // JWKS or introspection → AuthInfo (set expiresAt; bad token → OAuthError invalid_token)
declare const oauthMetadata: OAuthMetadata // your IdP's RFC 8414 metadata
const resourceServerUrl = new URL('https://api.example.com/mcp')
const gate = requireBearerAuth({
  verifier,
  requiredScopes: ['mcp'], // optional
  expectedResource: resourceServerUrl,
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceServerUrl),
})
const mcpHandler = createMcpHandler(
  createMcpFactory(app, {
    name: 'planets',
    version: '1.0.0',
    // IdP claims → contract context; `extra` is verifier-defined, so check it.
    context: (info): AppCtx => {
      const sub = info.authInfo?.extra?.sub
      if (typeof sub !== 'string') throw new PFError({ code: 'UNAUTHORIZED', message: 'Token has no subject' })
      return { db, user: { id: sub } }
    },
  }),
)

export async function fetchHandler(request: Request): Promise<Response> {
  const metadata = oauthMetadataResponse(request, { oauthMetadata, resourceServerUrl })
  if (metadata) return metadata
  const authInfo = await gate(request)
  return authInfo instanceof Response ? authInfo : mcpHandler.fetch(request, { authInfo })
}
```
- Tests and agent frameworks: `tools.list(info)` / `tools.call(name, args, info)`, no transport. End to end: `createMcpHandler(factory).fetch` with the v2 `Client` and `versionNegotiation: { mode: 'auto' }` (the client defaults to the 2025 protocol).

## API

- `mcp` (`@ts-pf/mcp/meta`)
- `createToolkit` — root members `$context`, `$tool`, `$host`, `$toolset`, `$coverage`
- `all`
- `bindTools` — `{ app, context, interceptors?, onError?, maxResultChars? }` or `{ client, context?, onError?, maxResultChars? }` (`context` required when the toolkit's context type has required keys)
- `audit` — `(toolsets, { maxTools? = 15, maxNameLength? = 60, missingDescription? = 'error' })` → `{ level, tool, message }[]`
- `createMcpFactory` (`@ts-pf/mcp/sdk`) — `(app, { name, version, instructions?, listTtlMs?, context, interceptors?, onError?, maxResultChars? })` (`context` optional for an unbranded app) or `(tools, { name, version, instructions?, listTtlMs? })`
- `McpTools` — `{ list(info?), call(name, args, info?), scopesFor?(name, args, info?) }` (`scopesFor` async)
- `McpCallInfo` — `{ authInfo?, requestInfo?, signal?, inputResponses?, era?, tool? }`; `tool` is `{ name, path }` of the tool being called (the inner tool for a host call)
- `McpToolDefinition`
- `McpToolResult`

## Pair with

- `ts-pf-contract`
- `ts-pf-server`
- `ts-pf-docs`

## Don't

- Import `@ts-pf/mcp` or `@ts-pf/mcp/sdk` from a contract file (use `@ts-pf/mcp/meta`).
- Reuse `FetchHandler` or a message handler to serve MCP; MCP is JSON-RPC 2.0, served by the SDK.
- Build on `@modelcontextprotocol/sdk` (v1) or the deprecated low-level `Server`.
- Cache or share one `McpServer` across requests; the factory builds one per request.
- Name contract keys starting with `$` (reserved for toolkit root members).
- Forward `Authorization` / `Cookie` headers into context; use `info.authInfo`.
- Expect interceptors to see the tool name; they see the procedure path. Copy `info.tool` into your context type in `context: (info) => …` if you trace tools.
- Treat `.visible()` or `.scopes()` as access control; procedure middleware is the boundary.
- Switch to hosts automatically by tool count, or add resources / prompts, `confirm`, `.title()`, `.text()`, or custom host name templates (later versions).
