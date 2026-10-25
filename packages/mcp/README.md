# @ts-pf/mcp

Opt-in MCP tools from a ts-pf contract. The contract defines the tools, an executor runs them (your `app` in-process, or a typed client), and the official MCP SDK v2 serves them. A projection plus an executor: no MCP wire code here, and no ts-pf HTTP or message handler is reused.

Agent skill: [`skills/ts-pf-mcp/`](skills/ts-pf-mcp/). Sync with `npx skills experimental_sync -y`.

Three entries:

- `@ts-pf/mcp/meta`: `mcp({ effect, description, aliases })`, dependency-free, safe in contract files.
- `@ts-pf/mcp`: the toolkit (`createToolkit`, `all`, `bindTools`, `audit`). Depends on `@ts-pf/contract`, `@ts-pf/docs`, `@ts-pf/server`, `@ts-pf/protocol`.
- `@ts-pf/mcp/sdk`: `createMcpFactory`, a per-request `McpServer` factory. Peer **`@modelcontextprotocol/server` >=2.3.0 <3**; keep one copy of it in the app (two copies break `createMcpHandler`'s `instanceof McpServer` check with an HTTP 500).

## One call

Every procedure becomes a tool named by its path (`planet.find` → `planet_find`); `docs({ hidden: true })` procedures are skipped. `context` runs once per call and is typed from the app's `$context<C>()`.

```ts
import { createMcpFactory } from '@ts-pf/mcp/sdk'

export const factory = createMcpFactory(app, { name: 'planets', version: '1.0.0' })
```

## Shape tools, compose toolsets, check coverage

Classify in the contract with `.meta({ ...docs({ description }), ...mcp({ effect: 'read' }) })`; unclassified tools count as `write`. Descriptions come from `.describe()`, then `mcp({ description })`, then `docs()` description / summary.

```ts
import { all, bindTools, createToolkit } from '@ts-pf/mcp'
import { createMcpFactory } from '@ts-pf/mcp/sdk'
import { contract } from './contract.js'

const tk = createToolkit(contract)

const findPlanet = tk.planet.find
  .describe('Get one planet by id. Call planet_list first if you only have a name.')
  .errors({ NOT_FOUND: ({ data }) => `No planet ${data.id}. Call planet_list for ids.` })

export const planetsMcp = tk.$toolset({
  tools: [all(tk.planet, { exclude: [tk.planet.find] }), { planet_find: findPlanet }],
})

// A new procedure fails this line until a toolset exposes it or `exclude` names it.
tk.$coverage({ toolsets: [planetsMcp] })

export const tools = bindTools(planetsMcp, { app, context: () => ({ db }) })
export const factory = createMcpFactory(tools, { name: 'planets', version: '1.0.0' })
```

Builder methods: `.describe(text)`, `.effect('read' | 'write' | 'destructive')`, `.inject({ key: fn })` (hidden from the model, filled per call), `.input(schema, map)` (a new model input; exclusive with `.inject`), `.output(map)` / `.output(schema, map)` (mappers get `{ context, info, call }`, `call` a typed client for joins; `outputSchema` and `structuredContent` only with a schema, and results are then checked), `.errors({ CODE: fn })`, `.examples([...])`, `.visible((info) => boolean)` (per-caller lists, below), `.scopes([...])` (OAuth step-up, below). `tk.$tool({ description, effect, input, run, visible?, scopes? })` is a composite tool over `call`.

`all(node, { effect, tags, exclude, inject, visible, scopes })` makes default tools for a node; each `inject` key goes only to tools whose input has it (union and intersection / `allOf` members included; a record, loose, or catchall input takes every key), and a typo or a type conflict is a compile error naming the field. A key must be a declared field of some selected input (a record's index signature does not count, so it cannot hide a typo); to inject into an input that is only a record, use `.inject()` on that tool (it accepts any key there, so spell it carefully). `all()` also throws on an undeclared key that got past the types. `all()` throws if `inject` is set and it cannot read a selected input's keys (no JSON Schema, or a recursive `$ref` member); exclude that procedure and bind it with `.input(schema, map)` (or `.inject()`). `tags` and `docs({ hidden: true })` filter in the types too when the contract writes them as literals (`docs({ tags: ['billing'] })`); a widened value (a `string[]` variable) keeps the tool in the type, and `$coverage` still checks at runtime.

Large groups go behind a host: `tk.$host({ description, tools, split, visible? })` lists `get_<key>_query_capabilities` / `call_<key>_query_capability` (read) and `get_<key>_operations_capabilities` / `call_<key>_operations_capability` (write + destructive), or `get_<key>_capabilities` / `call_<key>_capability` with `split: false`. Discovery takes `{ query, category, names, detail, limit }` and ranks with BM25. Flat tools do best up to about 15 per toolset; `audit()` warns above that.

## Serve

`@modelcontextprotocol/server` owns the transport. Over HTTP, pass the verified token as `authInfo`; it reaches `context` as `info.authInfo`. Request headers are not forwarded to procedures; `context` sees the `Request` as `info.requestInfo` and should derive identity from `authInfo`, not raw `Authorization` / `Cookie`. stdio never carries a token, so give identity from the process: `serveStdio((ctx) => factory({ ...ctx, authInfo }))` with `serveStdio` from `@modelcontextprotocol/server/stdio`.

```ts
import { createMcpHandler } from '@modelcontextprotocol/server'
import { createMcpFactory } from '@ts-pf/mcp/sdk'

const factory = createMcpFactory(app, { name: 'planets', version: '1.0.0' })
const mcpHandler = createMcpHandler(factory)
export const response = await mcpHandler.fetch(request)
```

## OAuth

An HTTP MCP server is an OAuth resource server. The SDK checks the token at the HTTP edge, before any MCP message is handled: a client starts sign-in only on a `401` with a `WWW-Authenticate` challenge, and an error from a tool call does not trigger it. ts-pf takes over from the verified `AuthInfo`. `context` maps your IdP's claims into the app's context, then the procedure's own middleware runs as usual.

```ts
import {
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  OAuthError,
  OAuthErrorCode,
  type OAuthMetadata,
  type OAuthTokenVerifier,
  oauthMetadataResponse,
  requireBearerAuth,
} from '@modelcontextprotocol/server'
import { createMcpFactory } from '@ts-pf/mcp/sdk'
import { PFError } from '@ts-pf/protocol'

const issuer = 'https://idp.example.com'
const resourceServerUrl = new URL('https://api.example.com/mcp')

// Your IdP's RFC 8414 metadata, re-served for clients that probe this origin.
// Fetched once at startup (fails fast if the IdP is down); hardcode it if you prefer.
// An IdP that serves only OIDC discovery has it at /.well-known/openid-configuration.
const oauthMetadata = (await (
  await fetch(`${issuer}/.well-known/oauth-authorization-server`)
).json()) as OAuthMetadata

const invalid = (message: string) =>
  new OAuthError(OAuthErrorCode.InvalidToken, message)

// Introspection (RFC 7662) as this server's own client; validating a JWT against the IdP's JWKS works too.
// Anything unexpected is `invalid_token` (a 401 challenge), never a crash.
const verifier: OAuthTokenVerifier = {
  async verifyAccessToken(token) {
    const response = await fetch(`${issuer}/oauth/introspect`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(`${env.MCP_CLIENT_ID}:${env.MCP_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({ token }),
    })
    if (!response.ok) throw invalid('Introspection failed')
    const claims = (await response.json()) as {
      active?: boolean
      sub?: string
      client_id?: string
      scope?: string
      exp?: number
      aud?: string | string[]
    }
    if (!claims.active || typeof claims.sub !== 'string') {
      throw invalid('Token is not active')
    }
    if (typeof claims.exp !== 'number') throw invalid('Token has no expiry')
    if (![claims.aud ?? []].flat().includes(resourceServerUrl.href)) {
      throw invalid('Token was issued for another resource')
    }
    return {
      token,
      clientId: claims.client_id ?? '',
      scopes: claims.scope?.split(' ') ?? [],
      expiresAt: claims.exp, // required: the SDK refuses tokens without it
      resource: resourceServerUrl,
      extra: { sub: claims.sub },
    }
  },
}

const gate = requireBearerAuth({
  verifier,
  requiredScopes: ['mcp'],
  expectedResource: resourceServerUrl, // refuse tokens issued for another audience
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceServerUrl),
})

// IdP claims → the contract's context. Procedure middleware then sees AppCtx, as on any other transport.
const factory = createMcpFactory(app, {
  name: 'planets',
  version: '1.0.0',
  context: async (info): Promise<AppCtx> => {
    const sub = info.authInfo?.extra?.sub
    if (typeof sub !== 'string') {
      // `extra` is whatever the verifier set; stdio and tests have no token at all.
      throw new PFError({ code: 'UNAUTHORIZED', message: 'Token has no subject' })
    }
    return { db, user: { id: sub } } // or look the user up by IdP subject
  },
})
const mcpHandler = createMcpHandler(factory)

export async function fetchHandler(request: Request): Promise<Response> {
  // `/.well-known/oauth-protected-resource/mcp` (RFC 9728) and the AS metadata.
  const metadata = oauthMetadataResponse(request, { oauthMetadata, resourceServerUrl })
  if (metadata) return metadata
  const authInfo = await gate(request)
  if (authInfo instanceof Response) return authInfo // 401 / 403 with the challenge
  return mcpHandler.fetch(request, { authInfo })
}
```

- With a toolkit, the same function goes on the binding: `bindTools(toolset, { app, context: (info) => … })`. `.inject()` and output mappers get both the mapped `context` and the raw `info.authInfo`.
- A gateway that calls an upstream ts-pf API as the user builds a client per caller: `bindTools(toolset, { client: (info) => createClient(…) })`, with the token from `info.authInfo` (exchanged for an upstream one when your IdP requires it). The function runs once per tool call; mapper `call` shares that client. Upstream errors map as in-process ones: declared codes through `.errors()`, `VALIDATION` with the model-facing schema, anything else `INTERNAL`.
- `context` can reject per tool (`info.tool`); the model gets that error as text. To have the client ask the user for a missing scope instead, declare it with `.scopes()` (below).
- Enforce roles and scopes in procedure middleware. `.visible()` and `.scopes()` shape what the client shows and asks for; they are not the security boundary.

### Scope step-up

`tk.admin.purge.scopes(['admin'])` (also `all(node, { scopes })` and `$tool({ scopes })`) declares the OAuth scopes a tool needs. Over HTTP, when the verified token lacks one, the SDK answers `403 insufficient_scope` before the call runs, and the client re-authorizes and retries. The challenge lists the granted scopes plus the required ones, so re-consent keeps what the caller had, and `resource_metadata` comes from `authInfo.resourceMetadataUrl` (set by `requireBearerAuth({ resourceMetadataUrl })`; otherwise derived from `authInfo.resource`). A host's `call_*` challenges per inner tool, so one dispatch tool can front procedures with different scopes; an inner tool hidden from the caller is never challenged (it answers `Unknown capability`). No token means no challenge (that is the authentication gate's job); stdio has no OAuth and is never challenged, and `tools.call()` does not enforce scopes, so middleware still has to. Scopes come from the toolkit (`bindTools`, then `createMcpFactory(tools, …)`); `createMcpFactory(app, …)` declares none. A string that is not an OAuth scope token throws a `TypeError` when the tool is built. `await tools.scopesFor?.(name, args, info)` reports what a call needs.

## Per-caller tool lists

```ts
import { all, bindTools, createToolkit, type McpCallInfo } from '@ts-pf/mcp'
import { contract } from './contract.js'

const tk = createToolkit(contract)
const isAdmin = (info: McpCallInfo) => info.authInfo?.scopes.includes('admin') ?? false

export const planetsMcp = tk.$toolset({
  tools: [
    all(tk.planet, { exclude: [tk.planet.create] }),
    { planet_create: tk.planet.create.visible(isAdmin) }, // only admins see it
  ],
})
export const tools = bindTools(planetsMcp, { app, context: () => ({ db }) })
```

`.visible(predicate)` (also `all(node, { visible })`, `$tool({ visible })`, and `$host({ visible })` for a whole host) shows a tool only to callers for whom the predicate is true. It gets `McpCallInfo` (`authInfo`, `requestInfo`, `era`), never `context`, and may be async. A hidden tool is left out of that caller's `tools/list` and is not registered on their `McpServer` (a call is `-32602`); `tools.call()` answers `Unknown tool "x"`. Inside a host, discovery, the `get_*` description, the `call_*` name list and annotations follow what the caller may see, and a bucket with nothing visible is not listed. Hide a tool or step up into it with `.scopes()`, not both. The `tools/list` cache hint is always `cacheScope: 'private'`; keep `listTtlMs` low when visibility depends on scopes that can change.

## Calls, options, audit

`tools.list(info)` and `tools.call(name, args, info)` work without MCP, in tests or an agent framework. `McpTools` is `{ list, call, scopesFor? }` (`scopesFor` is async). `McpCallInfo` is `{ authInfo?, requestInfo?, signal?, inputResponses?, era?, tool? }`; `tool` (`{ name, path }`) is set before `context` runs, so a project that wants tool-level tracing in interceptors copies it into its own context type.

Call pipeline options live on the executor: `bindTools(toolset, { app, context, interceptors?, onError?, maxResultChars? })` or `bindTools(toolset, { client, context?, onError?, maxResultChars? })` (`client` may be `(info) => client`; `context` is required when the toolkit's `$context<C>()` type has required keys). `createMcpFactory(app, …)` takes the same options plus `name`, `version`, `instructions`, `listTtlMs`. Unknown throws become `INTERNAL: Internal server error` and are logged with `console.error` unless `onError` is set, like `FetchHandler`. Text results are cut at `maxResultChars` (default 25,000).

`audit(toolsets, { maxTools?, maxNameLength?, missingDescription? })` returns `AuditFinding[]` (`{ level, tool, message }`) for CI: missing descriptions (`missingDescription`, default `'error'`), unclassified tools, schema roots, more than `maxTools` (15) listed tools, and names over `maxNameLength` (60) characters or outside the MCP name charset.

## Clients

Checked against MCP Inspector 2.12 (CLI, HTTP and stdio, both protocol eras) and Claude Code 2.1 (HTTP and stdio; it negotiates 2026-07-28). Tool lists, host tools, `structuredContent`, error text, truncation, OAuth sign-in, and scope step-up behave as described above. Client quirks worth knowing:

- The Inspector coerces arguments to the schema's type before sending (`"x"` for an integer becomes `null`), so the `VALIDATION` text reports the coerced value.
- Claude Code does not show annotations to the model or use `readOnlyHint` to skip permission prompts, and it cannot send a value of the wrong JSON type, so the model mostly sees range and format `VALIDATION` errors. It passes `structuredContent` to the model as text.

## API

- `mcp`
- `createToolkit`
- `all`
- `bindTools`
- `audit`
- `createMcpFactory`
- `McpTools`
- `McpCallInfo`
- `McpToolDefinition`
- `McpToolResult`

`mcp` is `@ts-pf/mcp/meta`. `createMcpFactory` is `@ts-pf/mcp/sdk`. The rest are `@ts-pf/mcp`, which also exports the types that appear in inferred toolkit values (`Toolkit`, `ToolkitNode`, `ToolBuilder`, `Toolset`, `Host`, `AllTools`, `CompositeTool`, …) so a toolset can be exported under `declaration: true`.
