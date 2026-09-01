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
  infer.ts            InferContract*, ContractClient, CallOptions
packages/protocol/src/
  error.ts            PFError
  envelope.ts         RpcRequest/Response, RpcCodec, RpcEncodedBody, RpcBodySource, PFResultPromise
  codec.ts            JSONCodec
  path.ts             join/parse procedure path
packages/server/src/
  implement.ts        createImplementer proxy tree
  runtime.ts          runProcedure, lookupProcedure, HandlerFn.signal
  handler.ts          FetchHandler (anti-buffering headers on ReadableStream bodies)
  caller.ts           createLocalClient
  middleware.ts       MiddlewareFn types
  plugins.ts          HandlerPlugin
  cors-plugin.ts      CORSPlugin / CORSPluginOptions
  request-limit-plugin.ts RequestLimitPlugin / RequestLimitPluginOptions
  request-headers-plugin.ts RequestHeadersPlugin / RequestHeadersPluginContext
  response-headers-plugin.ts ResponseHeadersPlugin / ResponseHeadersPluginContext
packages/client/src/
  client.ts           createClient proxy
  fetch-link.ts       FetchLink (signal, duplex: 'half', rethrows PFError from decodeResponse)
  interceptors.ts
  as-result.ts        asResult
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
      .errors({ NOT_FOUND: { status: 404 } }),
  },
})

const impl = createImplementer(contract).$context<{ db: Db }>()
export const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input, context, errors }) => {
      const row = await context.db.planets.get(input.id)
      if (!row) throw errors.NOT_FOUND()
      return row
    }),
  },
})

const handler = new FetchHandler(app)
await handler.handle(request, { prefix: '/rpc', context: { db } })

const client = createClient<typeof contract>(new FetchLink({ url: '/rpc' }))
await client.planet.find({ id: 1 })
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
7. Output schema (500 `VALIDATION` — server bug)
8. Encode body (`RpcCodec`)
9. On throw: `HandlerPlugin.onError` (side-effect only), then encode failure
10. `HandlerPlugin.onResponse` — every matched `Response` (success, 405, errors, short-circuit)

`createImplementer(contract).use(mw).router({...})` prepends `mw` onto every procedure in that tree, even if leaves were built from a builder without `mw`.

`createLocalClient(app, { context })` runs procedure middleware → validate → handler in-process. No `HandlerPlugin`, no `RpcCodec` / HTTP.

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
| Typed errors on a procedure | `.errors({ CODE: { status, message, data? } })` then `throw errors.CODE(data)` or `new PFError(...)` |

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

## Review checklist

- Names match the table in `.agents/rules.md`
- DAG still acyclic; client never depends on server; `@ts-pf/file` protocol-only; `@ts-pf/stream` protocol + contract; `@ts-pf/sse` stream + protocol; none imported by contract/server/client (prod)
- Public exports: file = `MultipartCodec`; stream = `StreamCodec` + `stream()`; sse = `SseCodec` + `SSE_CONTENT_TYPE`. Server plugins = `HandlerPlugin`, `CORSPlugin`, `RequestLimitPlugin`, `RequestHeadersPlugin`, `ResponseHeadersPlugin`, `RequestHeadersPluginContext`, `ResponseHeadersPluginContext`, `CORSPluginOptions`, `RequestLimitPluginOptions`. `RpcBodySource.body()` and `FetchLink` `duplex: 'half'` still present. `CallOptions.signal` forwarded; typed handlers include `signal`; middleware still has no `signal`. Streamed `ReadableStream` responses get anti-buffering headers. `FetchLink` rethrows `PFError` from `decodeResponse`. `HandlerPlugin.onResponse` runs on errors and 405. `OPTIONS` without `CORSPlugin` is still 405
- Separation of concern for long term maintainability of all packages and their dependencies
- Procedure completeness: `impl.router()` rejects missing/extra keys (types + runtime)
- Errors: unknown throws → `INTERNAL` 500, no stack in JSON
- Protocol edits update `PROTOCOL.md`, `ProtocolErrorCode` in `packages/protocol/src/error.ts`, and the duplicated `ProtocolErrorCode` union in `packages/contract/src/infer.ts`
- `pnpm lint && pnpm type-check && pnpm test && pnpm build`
