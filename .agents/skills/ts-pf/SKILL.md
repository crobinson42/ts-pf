---
name: ts-pf
description: Use when implementing, reviewing, refactoring, or extending the ts-pf library — @ts-pf/contract, protocol, server, client, file, stream, or sse; procedure/router builders; FetchHandler; createClient; schema adapters; middleware; JSON RPC; MultipartCodec; StreamCodec; or SseCodec.
---

# ts-pf

Follow [`.agents/rules.md`](../../rules.md) for locks and public names. This skill is the architecture map and the "how to change it" guide.

Wire format: `packages/protocol/PROTOCOL.md`. DX overview: `README.md`.

## File map

```
packages/contract/src/
  builder.ts          procedure singleton, router()
  procedure.ts        ContractProcedure brand
  router.ts           nested-object brand + walk
  schema.ts           validateSchema dispatch
  adapters/           standard-schema, typebox
  errors.ts           ErrorDef, ErrorMap, InferErrorData
  infer.ts            InferContract*, InferContractErrors, ClientError, ContractClient, ContractResultPromise, CallOptions
packages/protocol/src/
  error.ts            PFError
  envelope.ts         RpcRequest/Response, RpcCodec, RpcEncodedBody, RpcBodySource, PFResultPromise
  codec.ts            JSONCodec
  path.ts             join/parse procedure path
packages/server/src/
  implement.ts        createImplementer proxy tree
  error-factory.ts    createErrorFactory, finalizeDeclaredError (internal; not exported)
  runtime.ts          runProcedure, lookupProcedure, HandlerFn.signal
  handler.ts          FetchHandler (anti-buffering headers on ReadableStream bodies)
  caller.ts           createLocalClient
  middleware.ts       MiddlewareFn, ErrorFactory (handler typed; middleware loose)
  plugins.ts          HandlerPlugin
  cors-plugin.ts      CORSPlugin / CORSPluginOptions
  request-limit-plugin.ts RequestLimitPlugin / RequestLimitPluginOptions
  request-headers-plugin.ts RequestHeadersPlugin / RequestHeadersPluginContext
  response-headers-plugin.ts ResponseHeadersPlugin / ResponseHeadersPluginContext
packages/client/src/
  client.ts           createClient proxy
  fetch-link.ts       FetchLink (signal, duplex: 'half', rethrows PFError; local network → INTERNAL status 0)
  interceptors.ts
  as-result.ts        asResult, CallResult
packages/file/src/
  index.ts            re-exports MultipartCodec only
  codec.ts            MultipartCodec (wraps JSONCodec)
  files.ts            Blob walk / placeholder inject (internal)
packages/stream/src/
  index.ts            StreamCodec + stream()
  codec.ts            JSONL wrap of JSONCodec
  schema.ts           stream() Standard Schema
  jsonl.ts            JSONL read/write (internal)
  is-async-iterable.ts (internal)
packages/sse/src/
  index.ts            SseCodec + SSE_CONTENT_TYPE
  codec.ts            SSE output wrap of StreamCodec
  sse.ts              SSE read/write (internal)
  is-async-iterable.ts (internal)
```

Do not merge handler + implementer. Do not put HTTP in contract.

## Happy path

```ts
import { procedure, router } from '@ts-pf/contract'
import { createImplementer, FetchHandler } from '@ts-pf/server'
import { createClient, FetchLink } from '@ts-pf/client'

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

Files are opt-in. Do not put this in the default happy path:

```ts
import { MultipartCodec } from '@ts-pf/file'

const codec = new MultipartCodec() // optional { maxFiles, maxFileSize, inner }
new FetchHandler(app, { codec })
new FetchLink({ url: '/rpc', codec })
// schemas: z.file() / File — no ts-pf file() helper
// createLocalClient has no codec; File/Blob stay in-process
```

Streams are opt-in too:

```ts
import { stream, StreamCodec } from '@ts-pf/stream'

const streamCodec = new StreamCodec() // optional { inner }
new FetchHandler(app, { codec: streamCodec })
new FetchLink({ url: '/rpc', codec: streamCodec })
procedure.output(stream(z.object({ token: z.string() })))
procedure.input(stream(z.object({ chunk: z.number() })))
// handler(async function* ({ input, signal }) { … })
// const items = await client.chat({ prompt }, { signal })
// for await (const item of items) { … }
// createLocalClient has no codec; AsyncIterable stays in-process
```

SSE is opt-in output framing of the same contracts. Do not put this in the default happy path:

```ts
import { stream } from '@ts-pf/stream'
import { SseCodec } from '@ts-pf/sse'

const sseCodec = new SseCodec() // optional { inner, keepAliveMs }
new FetchHandler(app, { codec: sseCodec })
new FetchLink({ url: '/rpc', codec: sseCodec })
// handler(async function* ({ input, signal }) { … })
// input streams stay JSONL; output streams are text/event-stream
```

`$context<C>()` is the source of context types. Middleware runtime-merges; it does not infer added keys.

## Call pipeline

0. `HandlerPlugin.onRequest` — optional `Request` wrap or `Response` short-circuit (CORS preflight). Prefix miss skips plugins.
1. Decode body (`RpcCodec`; JSONCodec is JSON, MultipartCodec may be multipart, StreamCodec may be JSONL, SseCodec may be JSONL input / SSE output)
2. `HandlerPlugin.onContext` — replace context (header bags)
3. `.use()` middleware — `input` is unvalidated
4. Input schema (422 `VALIDATION` on fail)
5. `.useAfter()` middleware — typed `input`
6. Handler
7. Output schema (`INTERNAL` 500 — server bug; no issues leaked)
8. `runProcedure` runs `finalizeDeclaredError` on any throw from `.use` / validate / `.useAfter` / handler / output (invalid declared `data` → `INTERNAL` 500, no payload)
9. Encode body (`RpcCodec`)
10. On throw: `HandlerPlugin.onError` (side-effect only), then encode failure
11. `HandlerPlugin.onResponse` — every matched `Response` (success, 405, errors, short-circuit)

`createImplementer(contract).use(mw).router({...})` prepends `mw` onto every procedure in that tree, even if leaves were built from a builder without `mw`.

`createLocalClient(app, { context })` runs procedure middleware → validate → handler in-process. No `HandlerPlugin`, no `RpcCodec` / HTTP. `runProcedure` validates declared error `data` (invalid → `INTERNAL`) and wraps async iterables so mid-stream throws get the same check.

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
| CORS / headers / request limits | `CORSPlugin` / `RequestHeadersPlugin` / `ResponseHeadersPlugin` / `RequestLimitPlugin` on `FetchHandler`. New plugin = new file implementing `HandlerPlugin`. File size limits are `MultipartCodec` options, not a plugin. Do not add `order`/`before`/`after`. `CORSPlugin` defaults `origin: '*'`, `allowMethods: ['POST']`; constructor throws if `credentials` is true with origin `'*'`. `RequestLimitPlugin` throws `PAYLOAD_TOO_LARGE` 413. |
| Extra wire types | new `RpcCodec` (or wrap `JSONCodec`). Encode is `{ contentType, body }`, not a raw string. Do not special-case Date/Map in core. |
| File/Blob | `@ts-pf/file` `MultipartCodec` on `FetchHandler` / `FetchLink` `{ codec }`. Limits are codec options (`maxFiles` / `maxFileSize`), not a HandlerPlugin. Do not export placeholders or a `file()` helper. Do not fold into contract/server/client. |
| AsyncIterable streams | `@ts-pf/stream` `StreamCodec` + `stream()` on `.input()` / `.output()`. Root only. JSONL envelopes, lazy `body()`. Nested streams and File/Blob in items are `BAD_REQUEST`. Custom fetch Links must set `duplex: 'half'`. |
| SSE output | `@ts-pf/sse` `SseCodec` on `FetchHandler` / `FetchLink`. Same `stream()` contracts. Output-only `text/event-stream` (`message` / `error` / `close`). Input streams stay JSONL. Fetch parser, not `EventSource`. Do not fold into `StreamCodec` or core. |
| OpenAPI, TanStack Query, Node HTTP, EventPublisher | **new package** under `packages/`. Do not fold into contract/server/client. |
| Typed errors on a procedure | `.errors({ CODE: { status, message, data? } })`. Handler: `throw errors.CODE(data)` — `ErrorFactory<TErrors>` requires `data` when the def has a schema and forbids extra args when it does not — or `throw new PFError(...)`. Middleware `errors` stays loose; undeclared codes (e.g. `UNAUTHORIZED`) via `new PFError(...)`. Do not type `MiddlewareFn` from the procedure map. Runtime factory is always the loose object; typing is only on `ProcedureBuilder.handler`. `runProcedure` + `finalizeDeclaredError` (internal) validate declared `data` (unary + wrapped async iterable); invalid/missing `data` when a schema exists → `INTERNAL` 500, never serialize the lie. Codes with no `data` schema and undeclared codes pass through. `ClientError<E>` is declared variants plus remaining protocol codes (`VALIDATION` still has `data: { issues }`); a declared code replaces the protocol variant so `NOT_FOUND` may be reused. `asResult` → `CallResult<T, E>` from `ContractResultPromise` (do not widen `E | PFError`). Non-JS clients switch on JSON `error.code`. No OpenAPI, catalog RPC, or `status` in `{ ok: false, error }`. |

New packages: same `exports` (source for workspace, `publishConfig` → `dist`), `tsc -p tsconfig.build.json`, Vitest, Biome. Depend downward only (no client↔server).

## Anti-patterns

- Client importing `@ts-pf/server` (tests may, as a **devDependency**)
- `@ts-pf/file`, `@ts-pf/stream`, or `@ts-pf/sse` imported by contract/server/client (prod)
- `PFFile` / `file()` on `@ts-pf/file`; `RpcCodec` that returns a raw string
- Nested streams, File/Blob in stream items, byte `ReadableStream` as the message-stream protocol, SSE in `JSONCodec` / `StreamCodec`
- `EventSource` as the ts-pf client; SSE request bodies; `Last-Event-ID` / publisher in core
- Forgetting `duplex: 'half'` when POSTing a `ReadableStream`; putting `signal` on `MiddlewareFn`
- HTTP routing or `Request` types in `contract`
- Schema validation in `protocol`
- Stacked `.input()` / `.output()` merge rules
- Serving REST and RPC from the same handler
- Middleware-index vs validation-index configuration (named `.use` / `.useAfter` only)
- A catch-all plugin manager
- CORS / body limits inside `handler.ts` instead of a plugin
- oRPC `*HandlerPlugin` names (`CORSHandlerPlugin`, `RequestLimitHandlerPlugin`, …)
- Folding multipart `maxFiles` / `maxFileSize` into `RequestLimitPlugin`
- OpenAPI or an error-catalog RPC in core; `status` inside `{ ok: false, error }`
- Client-side validation of error `data`; passing a runtime contract into `createClient` to type errors
- Typing `MiddlewareFn.errors` from the procedure `ErrorMap`
- Widening `asResult` to `CallResult<T, E | PFError>`
- Exporting `createErrorFactory` / `finalizeDeclaredError`
- Importing `@ts-pf/protocol` into contract to share `ProtocolErrorCode`
- Redeclaring `VALIDATION` / `INTERNAL` / `BAD_REQUEST` / `METHOD_NOT_ALLOWED` / `PAYLOAD_TOO_LARGE` on `.errors()`
- Adding FetchLink `status: 0` to the protocol status table

## Review checklist

- Names match the table in `.agents/rules.md`
- DAG still acyclic; client never depends on server; `@ts-pf/file` protocol-only; `@ts-pf/stream` protocol + contract; `@ts-pf/sse` stream + protocol; none imported by contract/server/client (prod)
- Public exports: file = `MultipartCodec`; stream = `StreamCodec` + `stream()`; sse = `SseCodec` + `SSE_CONTENT_TYPE`. Server plugins = `HandlerPlugin`, `CORSPlugin`, `RequestLimitPlugin`, `RequestHeadersPlugin`, `ResponseHeadersPlugin`, `RequestHeadersPluginContext`, `ResponseHeadersPluginContext`, `CORSPluginOptions`, `RequestLimitPluginOptions`. Contract errors = `ClientError`, `InferErrorData`, `InferContractErrors` (and `InferContractErrorCodes`). Client = `asResult` + `CallResult`. Server exports `ErrorFactory`; does **not** export `createErrorFactory` / `finalizeDeclaredError`. Handler `errors` is `ErrorFactory<TErrors>`; middleware `errors` is default `ErrorFactory`. `ClientError` still includes protocol codes except those the procedure redeclared. `RpcBodySource.body()` and `FetchLink` `duplex: 'half'` still present. `CallOptions.signal` forwarded; typed handlers include `signal`; middleware still has no `signal`. Streamed `ReadableStream` responses get anti-buffering headers. `FetchLink` rethrows `PFError` from `decodeResponse`. `HandlerPlugin.onResponse` runs on errors and 405. `OPTIONS` without `CORSPlugin` is still 405
- Separation of concern for long term maintainability of all packages and their dependencies
- Procedure completeness: `impl.router()` rejects missing/extra keys (types + runtime)
- Errors: unknown throws → `INTERNAL` 500, no stack in JSON. Unary output schema failure → `INTERNAL` 500, no issues. Invalid declared error `data` → `INTERNAL` 500, never serialize the bad payload. `ClientError` narrows `data` from `code`. `asResult` is `CallResult<T, E>` (no `E | PFError` widen). Do not put `status` / `defined` / brands on the JSON error object.
- Protocol edits update `PROTOCOL.md`, `ProtocolErrorCode` in `packages/protocol/src/error.ts`, and the duplicated **private** `ProtocolErrorCode` union in `packages/contract/src/infer.ts` (do not import protocol into contract)
- `pnpm lint && pnpm type-check && pnpm test && pnpm build`
