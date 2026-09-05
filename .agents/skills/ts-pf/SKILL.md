---
name: ts-pf
description: Use when implementing, reviewing, refactoring, or extending the ts-pf library — @ts-pf/contract, protocol, server, client, http, server-http, client-http, file, stream, sse, docs, openapi, codegen, message, message-server, message-client, swr, or mvc-kit; procedure/router builders; FetchHandler; createClient; schema adapters; middleware; JSON RPC; MultipartCodec; StreamCodec; SseCodec; catalog()/docs(); openapi(); emit()/catalogHash(); PortHandler/WsHandler/StdioHandler; PortLink/WsLink/StdioLink; createSwr; bindClient; CallInterceptor; CallPlugin; intercept(); RetryPlugin; DedupePlugin; CachePlugin; Fetch vs call interceptors.
metadata:
  internal: true
---

# ts-pf

Follow [`.agents/rules.md`](../../rules.md) for locks and public names. This skill is the architecture map and the "how to change it" guide. Consumer usage docs live in `packages/<pkg>/skills/` (hub: `packages/contract/skills/ts-pf-app`). Do not publish this file. Downstream install is `npx skills experimental_sync -y` — never a library `postinstall`.

Wire format: `packages/protocol/PROTOCOL.md`. DX overview: `README.md`.

**This procedure model, any pipe.** The port is `runProcedure` / `Link.call`. Fetch is an adapter.

## File map

```
examples/
  README.md           learning path
  hello/              contract, implementer, FetchHandler, FetchLink, createClient
  message/            PortHandler + PortLink over MessageChannel
  stream/             StreamCodec + stream()
  plugins/            CallPlugin / CallInterceptor; first-party retry/cache/dedupe; local TimeoutPlugin / AuditPlugin; CORSPlugin is HTTP-only
scripts/check-skills.mjs
packages/*/skills/ts-pf-<pkg>/SKILL.md   consumer usage (hub ts-pf-app on contract)
packages/contract/src/
  builder.ts          procedure singleton, router()
  procedure.ts        ContractProcedure brand
  router.ts           nested-object brand + walk
  schema.ts           validateSchema dispatch
  adapters/           standard-schema, typebox
  errors.ts           ErrorDef, ErrorMap, InferErrorData
  infer.ts            InferContract*, InferContractErrors, ClientError, ContractClient, ContractResultPromise, CallOptions
packages/protocol/src/
  error.ts            PFError (cause?; local?; toJSON omits status/cause/local), localFailure
  envelope.ts         RpcRequest/Response, PROTOCOL_VERSION, PFResultPromise
packages/http/src/
  rpc.ts              PROTOCOL_HEADER, RpcCodec, RpcEncodedBody, RpcBodySource
  codec.ts            JSONCodec
  path.ts             join/parse procedure URL path
  http-status.ts      httpStatus / PROTOCOL_HTTP_STATUS
packages/server/src/
  implement.ts        createImplementer proxy tree
  error-factory.ts    createErrorFactory, finalizeDeclaredError (internal; not exported)
  runtime.ts          runProcedure, lookupProcedure, HandlerFn.signal, RunProcedureOptions.interceptors
  caller.ts           createLocalClient (optional interceptors/plugins)
  middleware.ts       MiddlewareFn, ErrorFactory (handler typed; middleware loose)
  call-interceptor.ts CallInterceptor (`runCallInterceptors` not exported)
  plugin.ts           CallPlugin, applyPlugins
  events.ts           onStart / onSuccess / onError / onFinish
  dedupe-plugin.ts    DedupePlugin (in-flight; pass `key` to restrict to reads)
packages/server-http/src/
  handler.ts          FetchHandler (anti-buffering headers on ReadableStream bodies; httpStatus on errors; `interceptors` around runProcedure)
  plugins.ts          HandlerPlugin
  cors-plugin.ts      CORSPlugin / CORSPluginOptions
  request-limit-plugin.ts RequestLimitPlugin / RequestLimitPluginOptions
  request-headers-plugin.ts RequestHeadersPlugin / RequestHeadersPluginContext
  response-headers-plugin.ts ResponseHeadersPlugin / ResponseHeadersPluginContext
packages/client/src/
  client.ts           createClient proxy (optional interceptors/plugins)
  link.ts             Link
  as-result.ts        asResult, CallResult
  is-local-failure.ts isLocalFailure (local === true)
  call-interceptor.ts CallInterceptor (`runCallInterceptors` not exported)
  plugin.ts           CallPlugin, applyPlugins
  intercept.ts        intercept(link, opts) — empty lists are identity
  events.ts           onStart / onSuccess / onError / onFinish
  retry-plugin.ts     RetryPlugin (default isLocalFailure; skip abort)
  dedupe-plugin.ts    DedupePlugin (in-flight)
  cache-plugin.ts     CachePlugin (ttl required; success only)
packages/client-http/src/
  fetch-link.ts       FetchLink (binds fetch to globalThis; signal, duplex: 'half'; protocol-header rethrow; localFailure on network/abort)
  interceptors.ts     raw fetch throws, not mapped PFError
packages/file/src/
  index.ts            re-exports MultipartCodec only
  codec.ts            MultipartCodec (wraps JSONCodec)
  files.ts            Blob walk / placeholder inject (internal)
packages/stream/src/
  index.ts            StreamCodec + stream()
  codec.ts            JSONL wrap of JSONCodec
  schema.ts           stream() Standard Schema
  jsonl.ts            JSONL read/write (internal)
packages/sse/src/
  index.ts            SseCodec + SSE_CONTENT_TYPE
  codec.ts            SSE output wrap of StreamCodec
packages/docs/src/
  index.ts            catalog, docs, getDocs, walkContract, toJsonSchema, registerJsonSchemaConverter
packages/openapi/src/
  index.ts            openapi, OpenAPIOptions, OpenAPIDocument
packages/codegen/src/
  index.ts            emit, catalogHash, EmitOptions
  cli.ts              emit / pull / hash (not exported from ".")
packages/message/src/
  index.ts            frames, MessageSession, Duplex, encodeFrame, decodeFrame, createMemoryDuplex, createPortDuplex, createWsDuplex, WebSocketLike
  error.ts            errorFromEnvelope (no HTTP status table), re-exports localFailure
  stdio.ts            createStdioDuplex — ./stdio only
packages/message-server/src/
  index.ts            PortHandler, WsHandler, HandlerOptions, type WebSocketLike (no stdio)
  port.ts             PortHandler
  ws.ts               WsHandler
  stdio.ts            StdioHandler — ./stdio only
  shared.ts           HandlerOptions (exported, `interceptors`); attachRouter / AttachRouterOptions (internal)
packages/message-client/src/
  index.ts            PortLink, WsLink, type WebSocketLike, type LinkOptions (no stdio)
  port.ts             PortLink
  ws.ts               WsLink
  stdio.ts            StdioLink — ./stdio only
  shared.ts           LinkOptions (exported); attachClient / AttachClientOptions (internal)
packages/swr/src/
  index.ts            createSwr + public types
packages/mvc-kit/src/
  index.ts            bindClient, DisposeSignalHost, issuesToFieldErrors
```

Do not merge handler + implementer. Do not put HTTP in contract. Do not put FetchHandler in server. Do not put FetchLink in client. Do not put RpcCodec in protocol.

## Happy path

```ts
import { procedure, router } from '@ts-pf/contract'
import { createImplementer } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'

export const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({ NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) } }),
  },
})

const impl = createImplementer(contract).$context<{ db: Db }>()
export const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input, context, errors }) => {
      const row = await context.db.planets.get(input.id)
      if (!row) throw errors.NOT_FOUND({ id: input.id })
      return row
    }),
  },
})

const handler = new FetchHandler(app)
await handler.handle(request, { prefix: '/rpc', context: { db } })

const client = createClient<typeof contract>(new FetchLink({ url: '/rpc' }))
await client.planet.find({ id: 1 })
// asResult(client.planet.find({ id: 1 })) — result.error.code === 'NOT_FOUND' narrows data
```

Runnable form of this happy path: `examples/hello`. Message: `examples/message`. Streams: `examples/stream`. Plugins: `examples/plugins`.

Files are opt-in. Do not put this in the default happy path:

```ts
import { MultipartCodec } from '@ts-pf/file'
import { FetchHandler } from '@ts-pf/server-http'
import { FetchLink } from '@ts-pf/client-http'

const codec = new MultipartCodec() // optional { maxFiles, maxFileSize, inner }
new FetchHandler(app, { codec })
new FetchLink({ url: '/rpc', codec })
```

Streams are opt-in too:

```ts
import { stream, StreamCodec } from '@ts-pf/stream'
import { FetchHandler } from '@ts-pf/server-http'
import { FetchLink } from '@ts-pf/client-http'

const streamCodec = new StreamCodec()
new FetchHandler(app, { codec: streamCodec })
new FetchLink({ url: '/rpc', codec: streamCodec })
procedure.output(stream(z.object({ token: z.string() })))
```

SSE is opt-in output framing of the same contracts:

```ts
import { stream } from '@ts-pf/stream'
import { SseCodec } from '@ts-pf/sse'
import { FetchHandler } from '@ts-pf/server-http'
import { FetchLink } from '@ts-pf/client-http'

const sseCodec = new SseCodec()
new FetchHandler(app, { codec: sseCodec })
new FetchLink({ url: '/rpc', codec: sseCodec })
```

Message transports are opt-in too:

```ts
import { PortHandler } from '@ts-pf/message-server'
import { PortLink } from '@ts-pf/message-client'
import { createClient } from '@ts-pf/client'

const { port1, port2 } = new MessageChannel()
new PortHandler(app).bind(port1, { context: { db } })
const client = createClient<typeof contract>(new PortLink({ port: port2 }))
```

`$context<C>()` is the source of context types. Middleware runtime-merges; it does not infer added keys.

## Call pipeline

0. `HandlerPlugin.onRequest` — optional `Request` wrap or `Response` short-circuit (CORS preflight). Prefix miss skips plugins.
1. Decode body (`RpcCodec`; JSONCodec is JSON, MultipartCodec may be multipart, StreamCodec may be JSONL, SseCodec may be JSONL input / SSE output)
2. Lookup procedure. Miss → `NOT_FOUND` (no call interceptors). Non-POST → `METHOD_NOT_ALLOWED` (Fetch; no call interceptors).
3. Context factory, then `HandlerPlugin.onContext` — replace context (header bags)
4. CallInterceptor onion around `runProcedure` (`FetchHandler({ interceptors })`, `HandlerOptions.interceptors`, `createLocalClient` `{ interceptors, plugins }`). `[0]` outermost. Inside `next()`:
   - `.use()` middleware — `input` is unvalidated
   - Input schema (`VALIDATION` on fail)
   - `.useAfter()` middleware — typed `input`
   - Handler
   - Output schema (`INTERNAL` — server bug; no issues leaked)
   - `finalizeDeclaredError` on any throw (invalid declared `data` → `INTERNAL`, no payload)
5. Encode body (`RpcCodec`)
6. On throw: `HandlerPlugin.onError` (side-effect only), then encode failure. HTTP status from `httpStatus(error)`.
7. `HandlerPlugin.onResponse` — every matched `Response` (success, 405, errors, short-circuit)

`createImplementer(contract).use(mw).router({...})` prepends `mw` onto every procedure in that tree.

`createLocalClient(app, { context, interceptors?, plugins? })` runs call interceptors around `runProcedure` (middleware → validate → handler) in-process. Interceptors attach per caller, not on `createImplementer`. `[0]` is outermost. `next({ context })` replaces context (does not merge). Client `intercept()` with empty lists returns the same `Link`. Server adapters omit empty `interceptors`; `runProcedure` no-ops on a missing/empty array. Interceptors see finalized throws from `finalizeDeclaredError`. Do not consume AsyncIterable output; return the wrapped iterator. No `HandlerPlugin`, no `RpcCodec` / HTTP. `runProcedure` validates declared error `data` (invalid → `INTERNAL`) and wraps async iterables so mid-stream throws get the same check. Duplicate `CallInterceptor` types — do not import from `@ts-pf/client`.

Steps 0–3 and 5–7 are Fetch (`HandlerPlugin` + `RpcCodec` + `Request`/`Response`) in `@ts-pf/server-http`. Message adapters replace those with JSON text frames and still run `lookupProcedure` + `runProcedure` for steps 2–4. Do not await `runProcedure` inside `MessageSession.onFrame`.

Client: `createClient` / `intercept()` call interceptors (path + input + signal) → `Link.call` → (Fetch only) encode → Fetch `Interceptor` onion → fetch → decode → mapped `PFError`. Fetch interceptors see raw throws / `Response`s, not `PFError`.

## Schemas

`procedure.input` / `.output` accept unconstrained `S`; types come from `InferSchemaOutput<S>`:

1. Zod 4-style `_zod.output`
2. TypeBox `static`
3. Standard Schema `~standard.types`

Runtime `validateSchema`: user `registerSchemaAdapter` (first `accept` match) → `'~standard' in schema` → TypeBox `Symbol.for('TypeBox.Kind')` → throw. TypeBox adapter dynamic-imports `@sinclair/typebox/value` (optional peer).

## How to add things

| Want | Do |
|---|---|
| Another validator | `registerSchemaAdapter` or `packages/contract/src/adapters/<vendor>.ts` |
| CORS / headers / request limits | `CORSPlugin` / `RequestHeadersPlugin` / `ResponseHeadersPlugin` / `RequestLimitPlugin` on `FetchHandler`. New plugin = new file implementing `HandlerPlugin` in `@ts-pf/server-http`. File size limits are `MultipartCodec` options, not a plugin. Do not add `order`/`before`/`after`. |
| Extra HTTP body encodings | new `RpcCodec` (or wrap `JSONCodec`) in/near `@ts-pf/http`. Encode is `{ contentType, body }`, not a raw string. |
| File/Blob | `@ts-pf/file` `MultipartCodec` on `FetchHandler` / `FetchLink` `{ codec }`. |
| AsyncIterable streams | `@ts-pf/stream` `StreamCodec` + `stream()` on `.input()` / `.output()`. Root only. JSONL envelopes. Nested streams and File/Blob in items are `BAD_REQUEST`. |
| SSE output | `@ts-pf/sse` `SseCodec` on `FetchHandler` / `FetchLink`. Same `stream()` contracts. |
| API docs / procedure catalog | `@ts-pf/docs` `docs()` + `catalog()`. |
| OpenAPI 3.1 document | `@ts-pf/openapi` `openapi(catalog(contract), { info })`. POST JSON RPC only. |
| Split-repo typed client | `@ts-pf/codegen` `emit(catalog)`. |
| Message transports (WS / stdio / MessagePort) | use existing `@ts-pf/message` / `message-server` / `message-client`. Do not fold into `FetchHandler`. Do not invent `TransportHandler`. Stdio is `./stdio` only. |
| A new **pipe** (WebTransport, Chrome port, Electron IPC, Unix socket) | new adapter package that calls `runProcedure` / implements `Link`. Never touch `createImplementer`, middleware, or `createClient`. |
| A new **paradigm** (gRPC, GraphQL, REST) | projection like `@ts-pf/openapi`, not an adapter of `runProcedure`. |
| SWR (React) | `@ts-pf/swr` `createSwr(client)`. |
| mvc-kit (MVVM) | `@ts-pf/mvc-kit` `bindClient(client, host)` + `issuesToFieldErrors`. |
| TanStack Query, Node HTTP, EventPublisher | **new package** under `packages/`. Do not fold into contract/server/client. Same PR: `skills/ts-pf-<pkg>/SKILL.md` and `"files"` includes `skills`. |
| Consumer usage skill | `packages/<pkg>/skills/ts-pf-<pkg>/SKILL.md` in the same PR as a public API / name / happy-path change. Hub is `ts-pf-app` on contract. `npm run check:skills`. |
| Typed errors on a procedure | `.errors({ CODE: { status?, message, data? } })`. `status` is optional HTTP / OpenAPI metadata. Handler: `throw errors.CODE(data)`. `ClientError<E>` is declared variants plus remaining protocol codes. `asResult` → `CallResult<T, E>`. Non-JS clients switch on JSON `error.code`. `isLocalFailure` is `local === true`. Do not put `status` or `cause` in `{ ok: false, error }`. |
| Retry / in-flight dedupe / cache | `RetryPlugin` / `DedupePlugin` / `CachePlugin` on `createClient(link, { plugins })`. Server `DedupePlugin` via `createLocalClient` `{ plugins }` or `applyPlugins` into `FetchHandler`/`HandlerOptions` `{ interceptors }`. Not FetchLink internals. Not Fetch interceptors (they cannot see structured input without cloning body). Skip `AsyncIterable` input; `CachePlugin` also does not cache iterable output. Server default dedupe keys every unary call — pass `key` to restrict to reads (unsafe for non-idempotent writes). Batch still refuse. |
| Timeout | `AbortSignal.timeout` — userland. |
| Batch | refuse. Out of scope. |

New **published** packages: `version` `0.0.0`, `license: "MIT"`, `files: ["dist", "skills"]`, `skills/ts-pf-<pkg>/SKILL.md`, workspace `exports` → `src` with matching `publishConfig.exports` → `dist` (mirror extra paths such as `./stdio`), `publishConfig.access: "public"`, `tsc -p tsconfig.build.json`, Vitest, Biome, a `.changeset/*.md`. While pre mode is on, add the name at `0.0.0` to `.changeset/pre.json` `initialVersions`. Internal `@ts-pf/*` deps: `"*"` (not `workspace:*`). `changeset version` rewrites `"*"` for the tarball; do not restore `"*"` on packages that already have a versioned range. Depend downward only (no client↔server, no server-http↔client-http). Repo is Changesets **pre mode** `beta` (`0.1.0-beta.N`, npm dist-tag `beta`); do not `changeset pre exit` until stable `0.1.0`. First public beta is a **minor** changeset; later betas on the same minor stay **patch** unless the change is breaking (`minor` → `0.2.0-beta.0`, `major` → `1.0.0-beta.0`). New **example** packages are `private: true` and should be appended to `.changeset/config.json` `ignore`.

## Anti-patterns

- Client importing `@ts-pf/server` (tests may, as a **devDependency**)
- `@ts-pf/http` imported by contract/server/client (prod)
- `@ts-pf/file`, `@ts-pf/stream`, or `@ts-pf/sse` imported by contract/server/client (prod)
- Inventing `TransportHandler`; porting `HandlerPlugin` onto WS / stdio / MessagePort
- Reusing `RpcCodec` as a message framer; putting `.ws()` / `.stdio()` / `.port()` on procedures
- Folding SSE or WebSocket into `@ts-pf/server-http`
- Putting `FetchHandler` in `@ts-pf/server` or `FetchLink` in `@ts-pf/client`
- Putting `JSONCodec` / `RpcCodec` / `PROTOCOL_HEADER` in `@ts-pf/protocol`
- Depending on the `ws` npm package
- Awaiting `runProcedure` inside `MessageSession`; context factory on `onFrame`
- Reconstructing HTTP status from `error.code` on message transports
- `OpenAPIHandler` / GET/PUT/path params; serving the spec from `FetchHandler`
- `createClientFromCatalog` in v1
- A catch-all plugin manager; ClientContext bags. Keep interface `HandlerPlugin`; class names stay `CORSPlugin` / `RetryPlugin` / `DedupePlugin`, never oRPC `*HandlerPlugin`. `CallPlugin` ≠ `HandlerPlugin`; `FetchHandler.plugins` is HTTP-only.
- Adding retry to FetchLink; using `isLocalFailure` inside Fetch interceptors
- Exporting `runCallInterceptors` from `@ts-pf/client` or `@ts-pf/server`; exporting Fetch `Interceptor` from `@ts-pf/client`; adding `close()` to `Link`; putting `path` on `next()` opts
- Putting `status` / `cause` / `local` on `PFError.toJSON()` / the wire envelope
- Widening `asResult` to `CallResult<T, E | PFError>`
- Exporting `createErrorFactory` / `finalizeDeclaredError`
- Importing `@ts-pf/protocol` into contract to share `ProtocolErrorCode`

## Review checklist

- Names match the table in `.agents/rules.md`
- DAG still acyclic; client never depends on server; server never depends on client; server-http never depends on client-http; client-http never depends on server-http (prod); `@ts-pf/http` not imported by contract/server/client (prod); file = http + protocol; stream = http + protocol + contract; sse = stream + http + protocol; docs = contract + protocol + http; openapi = docs; codegen = docs; swr = contract (peer swr); mvc-kit = contract (peer mvc-kit >= 4.9.0); message = protocol; message-server = message + server + protocol (never client); message-client = message + client (never server prod). No `TransportHandler`. Stdio is not on the main index.
- Public exports: protocol = `PFError`, `PFErrorInit`, `isPFError`, `localFailure`, `ProtocolErrorCode`, `PROTOCOL_VERSION`, envelope types, `PFResultPromise`. Not `JSONCodec` / `RpcCodec` / `PROTOCOL_HEADER` / path helpers. server = implementer, local client, `runProcedure`, `lookupProcedure`, middleware types, `CallInterceptor`, `CallPlugin`, `applyPlugins`, `onStart` / `onSuccess` / `onError` / `onFinish`, `RunProcedureOptions`, `DedupePlugin`, `DedupePluginOptions`. Not `FetchHandler` / `HandlerPlugin` / `runCallInterceptors`. client = `createClient`, `Link`, `asResult`, `CallResult`, `isLocalFailure`, `intercept`, `CallInterceptor`, `CallPlugin`, `applyPlugins`, `onStart` / `onSuccess` / `onError` / `onFinish`, `RetryPlugin`, `RetryPluginOptions`, `DedupePlugin`, `DedupePluginOptions`, `CachePlugin`, `CachePluginOptions`. Not `FetchLink` / Fetch `Interceptor` / `runCallInterceptors`. http = `JSONCodec`, `RpcCodec`, `RpcEncodedBody`, `RpcBodySource`, `PROTOCOL_HEADER`, path helpers, `httpStatus`, `PROTOCOL_HTTP_STATUS`. server-http = `FetchHandler`, `HandleResult`, `HandlerPlugin`, CORS/limit/header plugins + option/context types. client-http = `FetchLink`, `Interceptor`. file = `MultipartCodec`. stream = `StreamCodec` + `stream()`. sse = `SseCodec` + `SSE_CONTENT_TYPE`. Server does **not** export `createErrorFactory` / `finalizeDeclaredError`. Links have `close()` on message-client impls; do **not** add `close()` to `Link`.
- `isLocalFailure` is `local === true`, not `status === 0`.
- `FetchHandler` uses `httpStatus(error)` for `Response.status`. Protocol codes map to the HTTP table. `METHOD_NOT_ALLOWED` is Fetch-only emission.
- `FetchLink` rethrows `PFError` from `decodeResponse` only when `x-ts-pf-protocol` is present. Non-RPC decode wrap uses HTTP status, not `local: true`. `FetchLink` binds fetch to `globalThis`. Streamed `ReadableStream` responses get anti-buffering headers.
- Procedure completeness: `impl.router()` rejects missing/extra keys (types + runtime)
- Errors: unknown throws → `INTERNAL`, no stack in JSON. Unary output schema failure → `INTERNAL`, no issues. Invalid declared error `data` → `INTERNAL`, never serialize the bad payload. `ClientError` narrows `data` from `code`. `asResult` is `CallResult<T, E>`.
- Protocol edits update `PROTOCOL.md`, `ProtocolErrorCode` in `packages/protocol/src/error.ts`, and the duplicated **private** `ProtocolErrorCode` union in `packages/contract/src/infer.ts`
- `npm run lint && npm run check:skills && npm run type-check && npm test && npm run build`
- Published-package changes include a `.changeset/*.md`. First beta: **minor**; later `0.1.0` betas: **patch** unless breaking. Releases stay on dist-tag `beta` until `changeset pre exit`. New published packages: `pre.json` `initialVersions`, `license` / `publishConfig.access` / `files: ["dist", "skills"]` / `skills/ts-pf-<pkg>/SKILL.md`. Do not restore `"*"` after a version bump.
- Matching `packages/<pkg>/skills/ts-pf-<pkg>` still matches public exports and names. `npm run check:skills`.
