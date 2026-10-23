---
name: ts-pf
description: Use when implementing, reviewing, refactoring, or extending the ts-pf library — @ts-pf/contract, protocol, server, client, http, server-http, client-http, file, stream, sse, docs, openapi, codegen, message, message-server, message-client, swr, mvc-kit, or astro; procedure/router builders; FetchHandler; createClient; schema adapters; middleware; JSON RPC; MultipartCodec; StreamCodec; SseCodec; catalog()/docs(); openapi(); emit()/catalogHash(); PortHandler/WsHandler/StdioHandler/DuplexHandler; PortLink/WsLink/StdioLink/DuplexLink; createSwr; bindClient; createAstroHandler; CallInterceptor; CallPlugin; intercept(); RetryPlugin; DedupePlugin; CachePlugin; Fetch vs call interceptors.
metadata:
  internal: true
---

# ts-pf

Follow [`.agents/rules.md`](../../rules.md) for locks and public names. This skill is the architecture map and the "how to change it" guide. Consumer usage docs live in `packages/<pkg>/skills/` (hub catalog: `packages/contract/skills/ts-pf-app`; index: `skills/README.md`). Do not publish this file. Downstream install is `npx skills experimental_sync -y` — never a library `postinstall`. Do not add a published `@ts-pf/skills` package.

Wire format: `packages/protocol/PROTOCOL.md`. DX overview: `README.md`.

**This procedure model, any pipe.** The port is `runProcedure` / `Link.call`. Fetch is an adapter.

## File map

```
examples/
  README.md           learning path; `npm test` (turbo, builds first) or `npm run build && npm run test:root` (root vitest.config.ts projects)
  hello/              contract, implementer, FetchHandler, FetchLink, createClient; src/serve.ts = example-local node:http bridge for `npm run dev` (not an adapter)
  codegen/            split-repo emit(catalog) → createClient<Contract>; scripts/generate.mjs refreshes catalog.json + contract.d.ts
  message/            PortHandler + PortLink over MessageChannel
  stream/             StreamCodec + stream()
  plugins/            CallPlugin / CallInterceptor; first-party retry/cache/dedupe; local TimeoutPlugin / AuditPlugin; CORSPlugin is HTTP-only
scripts/check-skills.mjs
scripts/check-deps.mjs                   @ts-pf/* DAG allow-list (mirrors rules.md "Packages"); package.json + src/tests imports; cycles
scripts/check-exports.mjs
scripts/check-snippets.mjs                tsc over fenced ```ts in README/SKILL/example docs against dist (flags: `no-check`, `bundler`)
scripts/bench.mjs                        `npm run bench`: ops/s for local / Fetch / MessagePort unary, declared error, and 2000-item streams (relative numbers; run before and after hot-path changes, see CONTRIBUTING "Benchmarks")
skills/README.md                         consumer skill index (not published)
packages/*/skills/ts-pf-<pkg>/SKILL.md   consumer usage (hub catalog ts-pf-app on contract)
packages/{contract,server,client}/tests/*.test-d.ts   type tests (expectTypeOf + @ts-expect-error); Vitest typecheck + tsc --noEmit
packages/{server-http,message-server,astro}/tests/*.test-d.ts   context-inference type tests; tsc --noEmit only (no Vitest typecheck there)
packages/contract/src/
  builder.ts          procedure singleton, router()
  procedure.ts        ContractProcedure brand
  router.ts           nested-object brand + walk
  schema.ts           validateSchema dispatch
  adapters/           standard-schema, typebox
  errors.ts           ErrorDef, ErrorMap, InferErrorData
  infer.ts            InferContractProcedure / IsContractProcedure (the one builder-or-ContractProcedure match; `[X] extends [never]`, never `X extends never`), InferContract*, InferContractErrors, ClientError, ContractClient, ContractResultPromise, CallOptions, ContractProtocolErrorCode (hand-written duplicate of the protocol set; no protocol import)
packages/protocol/src/
  error.ts            PFError (status? with no default; cause?; local?; toJSON omits status/cause/local), localFailure (status 0 + local), ProtocolErrorCode (closed set; source of truth)
  envelope.ts         RpcRequest/Response, PROTOCOL_MAJOR (1 as const) → PROTOCOL_VERSION ('1'), PFResultPromise
  wire-error.ts       toWireError (PFError → toJSON; unknown throw → fixed INTERNAL "Internal server error", no leak) — the only copy of that mapping
  is-async-iterable.ts isAsyncIterable (object or function with a Symbol.asyncIterator function; ReadableStream is NOT excluded — wire sites compose a local isItemStream)
  defined.ts          defined(obj) / Defined<T> — copy without undefined-valued keys, typed optional; `{ ...required, ...defined({ signal }) }` replaces `...(x ? { x } : {})` at cold option boundaries (astro client construction). Per-call hot paths (server runtime / call-interceptor / events / error-factory, client events / call-interceptor) do not call it: they build the object with its required keys and assign each optional key only when present (same `exactOptionalPropertyTypes` outcome, no per-call copy; `npm run bench` guards it)
packages/http/src/
  rpc.ts              PROTOCOL_HEADER, RpcCodec, RpcEncodedBody, RpcBodySource; RpcEncodedText + EnvelopeTextCodec (the `inner` role of the wrapping codecs: an RpcCodec whose encoded bodies are strings)
  codec.ts            JSONCodec implements EnvelopeTextCodec (envelope object with keys but no `input` → BAD_REQUEST; wrapping codecs inherit it)
  content-type.ts     mimeType (media type, lower-cased, no params) / isJsonContentType (application/json or no header)
  body-source.ts      jsonBodySource(text) — an RpcBodySource over one in-memory envelope (multipart `rpc` part, JSONL line, SSE data)
  path.ts             join/parse procedure URL path
  http-status.ts      httpStatus / PROTOCOL_HTTP_STATUS (code → status; keys must equal ProtocolErrorCode; else error.status ?? 400 — the only HTTP default)
packages/server/src/
  implement.ts        createImplementer: createNode dispatches to createRouterNode (immutable; use()/useAfter()/$context() return a fresh node) + createProcedureNode (short-lived builder; use()/useAfter() mutate its own arrays, handler() seals); Implementer.router is <I>(impl: I & RouterImplCheck<T, TCtx, I>) → ImplementedRouter<T, TCtx>; ProcedureBuilder carries TContract; its use() takes the same MiddlewareFn<TCtx, unknown, unknown> as impl.use() (impl.middleware() fits both), useAfter() is typed per procedure
  error-factory.ts    createErrorFactory (stamps a declared ErrorDef.status only; no 400 default), finalizeDeclaredError (internal; not exported; invalid declared data → INTERNAL with the original error as `cause`)
  runtime.ts          runProcedure (output-schema INTERNAL carries the issues as `cause`), lookupProcedure (Object.hasOwn per segment), HandlerFn.signal, RunProcedureOptions.interceptors, ProcedureValidation; ImplementedProcedure<TContract, TCtx> / ImplementedRouter<T, TCtx> phantom brands (ContractShape = contract InferContractProcedure minus meta, RouterImpl, MissingProcedures / UnexpectedKeys / PresentProcedures → RouterImplCheck; IsContractProcedure is contract's)
  caller.ts           createLocalClient (context typed from the router brand via NoInfer; optional interceptors/plugins/validation)
  middleware.ts       MiddlewareFn, ErrorFactory (handler typed; middleware loose)
  call-interceptor.ts CallInterceptor (`runCallInterceptors` not exported)
  plugin.ts           CallPlugin, applyPlugins
  events.ts           onStart / onSuccess / onError / onFinish
  dedupe-plugin.ts    DedupePlugin (in-flight; pass `key` to restrict to reads)
packages/server-http/src/
  handler.ts          FetchHandler (TCtx inferred from app's context brand, ImplementedRouter<unknown, TCtx>; anti-buffering headers on ReadableStream bodies; httpStatus on errors; `interceptors` around runProcedure; `validation` forwarded into it; `onError` option / `FetchHandlerOnError` or default console.error for unknown / INTERNAL)
  plugins.ts          HandlerPlugin
  cors-plugin.ts      CORSPlugin / CORSPluginOptions
  request-limit-plugin.ts RequestLimitPlugin / RequestLimitPluginOptions
  request-headers-plugin.ts RequestHeadersPlugin / RequestHeadersPluginContext
  response-headers-plugin.ts ResponseHeadersPlugin / ResponseHeadersPluginContext
packages/client/src/
  client.ts           createClient<T = never> proxy (optional interceptors/plugins; `{ '~error': ... }` result type when T is omitted and not inferable)
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
  codec.ts            MultipartCodec (wraps an EnvelopeTextCodec, default JSONCodec; mimeType / isJsonContentType / jsonBodySource from http)
  files.ts            Blob walk / placeholder inject (internal)
packages/stream/src/
  index.ts            StreamCodec + stream()
  codec.ts            JSONL wrap of an EnvelopeTextCodec, default JSONCodec (in-band failure lines via toWireError → PFError without status; content-type / body-source helpers from http)
  schema.ts           stream() Standard Schema
  jsonl.ts            JSONL read/write (internal)
  item-stream.ts      isItemStream = protocol isAsyncIterable minus ReadableStream (bytes, not items; internal, not exported — sse, message-server, and message-client inline the same 3 lines)
packages/sse/src/
  index.ts            SseCodec + SSE_CONTENT_TYPE
  codec.ts            SSE output wrap of StreamCodec (event: error via toWireError → PFError without status; local isItemStream; inner is an EnvelopeTextCodec; mimeType / jsonBodySource from http)
packages/docs/src/
  index.ts            catalog, docs, getDocs, walkContract, toJsonSchema, registerJsonSchemaConverter
  catalog.ts          catalog(); protocolErrors derived from ProtocolErrorCode + PROTOCOL_HTTP_STATUS (no local table)
packages/openapi/src/
  index.ts            openapi, OpenAPIOptions, OpenAPIDocument
packages/codegen/src/
  index.ts            emit, catalogHash, EmitOptions
  cli.ts              emit / pull / hash (not exported from ".")
  jsdoc.ts            JSDoc from catalog docs() (internal; not exported)
packages/message/src/
  index.ts            frames, MessageSession, Duplex, encodeFrame, decodeFrame, createMemoryDuplex, createPortDuplex, createWsDuplex, WebSocketLike, createPushQueue / PushQueue / PushQueueOptions, BackpressureOptions / StallInfo / Backpressure / resolveBackpressure / DrainWaiter / DrainOutcome
  duplex.ts           Duplex (send(): void | Promise<void> — a promise = above the write mark, must settle on close, rejection closes; optional pause() / resume()); createMemoryDuplex({ highWaterMark? }) — per-end inbox, one flush microtask, pause holds delivery, drain promise above the mark (sync without the option)
  backpressure.ts     BackpressureOptions / StallInfo (public); Backpressure / resolveBackpressure / DrainWaiter / DrainOutcome (`@internal`, for the two bindings); DEFAULT_HIGH_WATER_MARK (1 MiB) / DEFAULT_DRAIN_TIMEOUT (30 s); resolveBackpressure (defaults + TypeError naming the option; identity on a resolved object, `false` stays `false`; default onStall warns on 'aborted' only); DrainWaiter (per-call wait: resolves first then notifies, onStall throws swallowed; onStall('paused') once, timer → 'timeout' + onStall('aborted'), cancel() → 'cancelled'; a second concurrent wait throws)
  session.ts          MessageSession; SendResult `{ ok: true, drained? }` (sendText wraps a thenable from duplex.send in untilDrainedOrClosed — resolver held in a `pendingDrains` Set only until it settles, flushed by enterClosed; a rejection closes the session; `pendingDrainCount` is an @internal test hook); onFrame(frame, size) with size = text.length (the receive-side mark unit)
  error.ts            errorFromEnvelope (no HTTP status table; status stays undefined); `localFailure` is a @deprecated re-export (import from protocol)
  push-queue.ts       createPushQueue(options?) / PushQueue — push(value, size = 1), one pending next(), one-shot end() / fail(error); bounded: onPause once buffered > highWaterMark, onResume once <= half or on end / fail; never drops (message-server input queues, message-client output queues; no local copies)
  port.ts             createPortDuplex — send is always sync, no pause / resume (a MessagePort has no buffer signal and cannot stop receiving); documented limitation
  ws.ts               createWsDuplex(socket, { highWaterMark? }) — WebSocketLike gains optional bufferedAmount / pause / resume; drain promise while bufferedAmount > mark (10 ms poll, cleared on close) or while the CONNECTING queue > mark (resolved by the open flush); pause / resume forwarded only when the socket has them
  stdio.ts            createStdioDuplex — ./stdio only; send returns a promise when output.write() is refused (resolved on 'drain' or close); pause / resume = input.pause() / input.resume()
packages/message-server/src/
  index.ts            DuplexHandler, PortHandler, WsHandler, HandlerOptions, type BackpressureOptions / StallInfo (re-exported from message), type WebSocketLike (no stdio; not attachRouter, not the duplex adapters)
  duplex.ts           DuplexHandler — bind(duplex, { context }) over any message Duplex (TCtx inferred from app's context brand); resolves `backpressure` in the constructor so a bad option throws at `new`; Port/Ws/Stdio wrap it
  port.ts             PortHandler = createPortDuplex + DuplexHandler (adds `port` to the context factory info)
  ws.ts               WsHandler = createWsDuplex(socket, { highWaterMark }) + DuplexHandler (adds `socket`)
  stdio.ts            StdioHandler = createStdioDuplex + DuplexHandler (adds `input` / `output`) — ./stdio only
  shared.ts           HandlerOptions (exported, `interceptors`, `validation`, `backpressure`); attachRouter / AttachRouterOptions (internal: one MessageSession, the inflight map, PROTOCOL.md frame routing, onHello context factory — a value context settles with zero awaits; the pausedQueues counter that calls duplex.pause?.() / resume?.() connection-wide); contextWithInfo
  call.ts             ServerCall (internal per-id state: abort signal, bounded in-item queue (push(value, size) → host.pauseReads / resumeReads), output iterator, DrainWaiter, the one send site with the PROTOCOL.md substitute-frame rule returning `{ drained? } | false`); emitStream awaits drained between items (awaitDrain), abortStalled on timeout (signal, return() once, frames dropped, sendResultErr INTERNAL `Peer did not drain within <n> ms`, no onError) + dispatchCall; result-frame errors via toWireError; local isItemStream
packages/message-client/src/
  index.ts            DuplexLink, PortLink, WsLink, type WebSocketLike, type LinkOptions, type BackpressureOptions / StallInfo (re-exported from message) (no stdio; not the duplex adapters)
  duplex.ts           DuplexLink — Link over any message Duplex (session, id allocation, frame routing, close); resolves `backpressure` in the constructor; the pausedQueues counter that calls duplex.pause?.() / resume?.(); Port/Ws/Stdio wrap it
  port.ts             PortLink = createPortDuplex + DuplexLink
  ws.ts               WsLink = socket open / close state machine + createWsDuplex(socket, { highWaterMark }) + DuplexLink (validates `backpressure` in its own constructor because the DuplexLink is built on open)
  stdio.ts            StdioLink = createStdioDuplex + DuplexLink — ./stdio only
  shared.ts           LinkOptions (exported, `backpressure`); abortedFailure / awaitWithAbort / isItemStream (internal; protocol isAsyncIterable minus ReadableStream)
  call.ts             ClientCall (internal per-id state: pending-first → streaming-out → done, in-item pump awaiting drained via a DrainWaiter (timeout → localFailure `Peer did not drain within <n> ms` + cancel + return() once), bounded output queue (push(value, size) → host.pauseReads / resumeReads), abort listener, cancel-on-break iterator); isPFError / localFailure from protocol
packages/swr/src/
  index.ts            createSwr + public types
packages/mvc-kit/src/
  index.ts            bindClient, DisposeSignalHost, issuesToFieldErrors
packages/astro/src/
  server.ts           createAstroHandler, createAstroLocalClient, withBase (./server; context typed from the app's TCtx via NoInfer)
  client.ts           createAstroClient<T = never> (./client; `{ '~error': ... }` result when T is omitted, like createClient)
  with-base.ts        withBase
  index.ts            re-exports client only
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

Runnable form of this happy path: `examples/hello` (`npm run dev` listens; the other examples are smoke-tested only). Split-repo typed client: `examples/codegen`. Message: `examples/message`. Streams: `examples/stream`. Plugins: `examples/plugins`.

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

Any other pipe is a `Duplex` (`send` / `onMessage` / `onClose` / `close`, JSON text) handed to `new DuplexHandler(app).bind(duplex, { context })` / `new DuplexLink({ duplex })`; the port / ws / stdio classes are those two over their adapters.

`$context<C>()` is the source of context types. `impl.router()` brands the tree with it (`ImplementedRouter<T, TCtx>`; leaves `ImplementedProcedure<TContract, TCtx>`), and `FetchHandler`, the message handlers, `createLocalClient`, and Astro infer `TCtx` from that brand and type `context` with it — so `new FetchHandler(app)` needs no generic and `context: (req) => ({ db, req })` types `req`. Only the router-level brand is read: a tree not produced by `impl.router()` infers `unknown` even if its leaves are branded; use `impl.router()`, or pick procedures into a second `impl.router()` call, to keep the check. Middleware runtime-merges; it does not infer added keys.

Compose is nested objects. `router({ planet: planetContract })` nests slice contracts. `impl.router({ planet: planetApp })` nests finished slice apps (`createImplementer(sliceContract).$context<AppCtx>().router({ ... })`). Root `.use(mw)` prepends; nested procedure `path` is the composed tree. Pick procedures for a second server (`{ list: usersApp.list }`). A slice built with a different `$context`, a handler under another procedure's key, a superset slice, or a missing / extra key is a type error naming the key (`MissingProcedures` / `UnexpectedKeys`); a slice that needs less context than the root provides nests (contravariant brand). No `mergeRouters` / `compose()` / lazy routers.

## Call pipeline

0. `HandlerPlugin.onRequest` — optional `Request` wrap or `Response` short-circuit (CORS preflight). Prefix miss skips plugins.
1. Method check, then protocol version, then lookup procedure. Non-POST → `METHOD_NOT_ALLOWED` (Fetch; no call interceptors). Request `x-ts-pf-protocol` present and not `PROTOCOL_VERSION` (trimmed) → `BAD_REQUEST` `Unsupported protocol version`, the message handshake's string (Fetch; no call interceptors; absent is accepted). Miss → `NOT_FOUND` (no call interceptors). All three answer before the body is read.
2. Decode body (`RpcCodec`; JSONCodec is JSON, MultipartCodec may be multipart, StreamCodec may be JSONL, SseCodec may be JSONL input / SSE output). Runs only for a known procedure.
3. Context factory, then `HandlerPlugin.onContext` — replace context (header bags)
4. CallInterceptor onion around `runProcedure` (`FetchHandler({ interceptors, validation })`, `HandlerOptions.interceptors` / `HandlerOptions.validation`, `createLocalClient` `{ interceptors, plugins, validation }`). `[0]` outermost. `next()` may be called more than once, concurrently; `runProcedure` builds the chain below inside a per-`next()` `execute(state)` closure, so each run owns its `input` / `context` / `signal` (do not hoist them back to `runProcedure` scope). Inside `next()`:
   - `.use()` middleware — `input` is unvalidated
   - Input schema when `validation.input !== false` (default on; `VALIDATION` on fail). Stream input items follow this flag
   - `.useAfter()` middleware — typed `input` when the input check ran; raw value when it was skipped
   - Handler
   - Output schema only when `validation.output === true` (default off; unary failure is `INTERNAL` — server bug; no issues leaked). Stream output items follow this flag (`VALIDATION` with `issues` from `stream()`)
   - `finalizeDeclaredError` on any throw (invalid declared `data` → `INTERNAL`, no payload). Declared error `data` is always checked
5. Encode body (`RpcCodec`)
6. On throw (including `METHOD_NOT_ALLOWED`, `BAD_REQUEST` `Unsupported protocol version`, `NOT_FOUND`, and codec `BAD_REQUEST` — invalid JSON or an envelope object with keys but no `input`): `HandlerPlugin.onError` (side-effect only, array order), then the `onError` option — or, when absent, `console.error` for non-`PFError` throws and `INTERNAL` `PFError`s only — then encode failure. HTTP status from `httpStatus(error)`. Throws after a stream has started are in-band codec items and skip this step.
7. `HandlerPlugin.onResponse` — every matched `Response` (success, 405, errors, short-circuit)

`createImplementer(contract).use(mw).router({...})` prepends `mw` onto every procedure in that tree.

`createLocalClient(app, { context, interceptors?, plugins?, validation? })` runs call interceptors around `runProcedure` (middleware → input check unless `validation.input` is false → handler → output check only when `validation.output` is true) in-process. Interceptors and `validation` attach per caller, not on `createImplementer`. `[0]` is outermost. `next({ context })` replaces context (does not merge). Client `intercept()` with empty lists returns the same `Link`. Server adapters omit empty `interceptors`; `runProcedure` no-ops on a missing/empty array. Interceptors see finalized throws from `finalizeDeclaredError`. Do not consume AsyncIterable output; return the wrapped iterator. No `HandlerPlugin`, no `RpcCodec` / HTTP. `runProcedure` validates declared error `data` (invalid → `INTERNAL`) and wraps async iterables so mid-stream throws get the same check. Duplicate `CallInterceptor` types — do not import from `@ts-pf/client`.

Steps 0–3 and 5–7 are Fetch (`HandlerPlugin` + `RpcCodec` + `Request`/`Response`) in `@ts-pf/server-http`. Message adapters replace those with JSON text frames and still run `lookupProcedure` + `runProcedure` for the lookup part of step 1 (the method and version checks are Fetch-only; the message handshake checks `v` instead) and step 4. Do not await `runProcedure` inside `MessageSession.onFrame`.

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
| Split-repo typed client | `@ts-pf/codegen` `emit(catalog)` (JSDoc from `docs()`; other `.meta()` stays on catalog JSON). |
| Message transports (WS / stdio / MessagePort) | use existing `@ts-pf/message` / `message-server` / `message-client`. Do not fold into `FetchHandler`. Do not invent `TransportHandler`. Stdio is `./stdio` only. Slow peers: `HandlerOptions.backpressure` / `LinkOptions.backpressure` (`BackpressureOptions`, on by default); never a new frame. |
| A new **pipe** (WebTransport, Chrome port, Electron IPC, Unix socket) | write a `Duplex` (`send` / `onMessage` / `onClose` / `close`, JSON text), then `new DuplexHandler(app).bind(duplex, opts)` / `new DuplexLink({ duplex })`. Handshake, multiplexing, cancel, and slow-peer protection are already there — never copy `attachRouter` / `ClientCall`. Backpressure comes from the duplex: return a promise from `send` while the pipe is above its write mark (WebTransport `writer.ready`, a Node `drain`; it must settle on close) and implement `pause` / `resume` when the pipe can stop receiving; return `void` and omit them when it cannot (Electron IPC, Chrome `runtime.Port`). Only a pipe that cannot carry the message frames is a new adapter package that calls `runProcedure` / implements `Link`. Never touch `createImplementer`, middleware, or `createClient`. |
| A new **paradigm** (gRPC, GraphQL, REST) | projection like `@ts-pf/openapi`, not an adapter of `runProcedure`. |
| SWR (React) | `@ts-pf/swr` `createSwr(client)`. |
| mvc-kit (MVVM) | `@ts-pf/mvc-kit` `bindClient(client, host)` + `issuesToFieldErrors`. |
| Astro endpoints and `.astro` pages | `@ts-pf/astro` (`createAstroHandler` / `createAstroLocalClient` / `createAstroClient` / `withBase`). Do not fold into server-http or client-http. |
| TanStack Query, Node HTTP, EventPublisher | **new package** under `packages/`. Do not fold into contract/server/client. Same PR: `skills/ts-pf-<pkg>/SKILL.md`, `"files"` includes `skills`, and `keywords` (shared family terms plus package-specific). |
| Consumer usage skill | `packages/<pkg>/skills/ts-pf-<pkg>/SKILL.md` plus the `## API` list in `packages/<pkg>/README.md` in the same PR as a public API / name / happy-path change (`check:skills` cross-asserts SKILL API symbols against the README; `check:snippets` type-checks fenced `ts` blocks). Hub catalog is `ts-pf-app` on contract (opt-in happy-path snippets too). Index: `skills/README.md`. `npm run check:skills`. Do not add `@ts-pf/skills`. |
| Typed errors on a procedure | `.errors({ CODE: { status?, message, data? } })`. `status` is optional HTTP / OpenAPI metadata; omitted → HTTP 400 via `httpStatus()`. Handler: `throw errors.CODE(data)`. `ClientError<E>` is declared variants plus remaining protocol codes; its `status?: number` is the HTTP response status over Fetch and `undefined` on message transports and mid-stream items (guard it: `err.status ?? 400`). `asResult` → `CallResult<T, E>`. Non-JS clients switch on JSON `error.code`. `isLocalFailure` is `local === true`. Do not put `status` or `cause` in `{ ok: false, error }`. |
| Retry / in-flight dedupe / cache | `RetryPlugin` / `DedupePlugin` / `CachePlugin` on `createClient(link, { plugins })`. Server `DedupePlugin` via `createLocalClient` `{ plugins }` or `applyPlugins` into `FetchHandler`/`HandlerOptions` `{ interceptors }`. Not FetchLink internals. Not Fetch interceptors (they cannot see structured input without cloning body). Skip `AsyncIterable` input; `CachePlugin` also does not cache iterable output. Server default dedupe keys every unary call — pass `key` to restrict to reads (unsafe for non-idempotent writes). Batch still refuse. |
| Timeout | `AbortSignal.timeout` — userland. |
| Batch | refuse. Out of scope. |
| Feature-slice / multi-server compose | Nested `router({ planet: planetContract })` and `impl.router({ planet: planetApp })`. Pick procedures for a smaller tree. Same `AppCtx` on every slice. Do not add `mergeRouters` / `compose()` / lazy routers. |

New **published** packages: `version` `0.0.0`, `license: "MIT"`, a `LICENSE` copy of the root file (npm packs it regardless of `files`), `engines.node >=20`, `files: ["dist", "skills"]`, `keywords` (shared `ts-pf` / `typescript` / `rpc` / `typesafe` / `typed-rpc` / `api` / `contract-first` plus package-specific terms), `skills/ts-pf-<pkg>/SKILL.md`, `exports` → `dist` (mirror extra paths such as `./stdio`), `publishConfig.access: "public"` only (do not put `exports` in `publishConfig`; npm leaves workspace `exports` in the tarball), `tsconfig.json` / `tsconfig.build.json` that extend root `tsconfig.base.json` (no `DOM`) or `tsconfig.dom.json` (adds `DOM`) and hold only per-package keys, `tsc -p tsconfig.build.json`, a `vitest.config.ts` with `resolve.alias: selfAlias(import.meta.url)` from root `vitest.shared.ts` (own name and `exports` subpaths → `src`), Biome, a `.changeset/*.md`. Internal `@ts-pf/*` deps: `"*"` (not `workspace:*`). `changeset version` rewrites `"*"` for the tarball; do not restore `"*"` on packages that already have a versioned range. Depend downward only (no client↔server, no server-http↔client-http). Releases use Changesets and publish to npm dist-tag `latest`. Do not run `changeset pre enter` or add `.changeset/pre.json`. New **example** packages are `private: true` and should be appended to `.changeset/config.json` `ignore`.

## Anti-patterns

- Client importing `@ts-pf/server` (tests may, as a **devDependency**)
- `@ts-pf/http` imported by contract/server/client (prod)
- `@ts-pf/file`, `@ts-pf/stream`, or `@ts-pf/sse` imported by contract/server/client (prod)
- Inventing `TransportHandler`; porting `HandlerPlugin` onto WS / stdio / MessagePort (`DuplexHandler` / `DuplexLink` are duplex-generic *inside* the message family, not a cross-wire handler)
- Reusing `RpcCodec` as a message framer; putting `.ws()` / `.stdio()` / `.port()` on procedures
- Folding SSE or WebSocket into `@ts-pf/server-http`
- Putting `FetchHandler` in `@ts-pf/server` or `FetchLink` in `@ts-pf/client`
- Putting `JSONCodec` / `RpcCodec` / `PROTOCOL_HEADER` in `@ts-pf/protocol`
- Depending on the `ws` npm package
- Awaiting `runProcedure` inside `MessageSession`; context factory on `onFrame`
- Credit / ack frames for message backpressure (v2); a second backpressure option bag; awaiting a synchronous `send` (no `drained`) in the unary or `onHello` path; a `Duplex.send` promise that does not settle on close; reporting a drain timeout through `onError` or a new error code; dropping frames in a receive queue
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
- Adding `mergeRouters` / `compose()` / lazy routers. Nest `router()` objects.
- Pointing `exports` at `src` and relying on `publishConfig.exports` — npm does not rewrite it.

## Review checklist

- Names match the table in `.agents/rules.md`
- DAG still acyclic; client never depends on server; server never depends on client; server-http never depends on client-http; client-http never depends on server-http (prod); `@ts-pf/http` not imported by contract/server/client (prod); file = http + protocol; stream = http + protocol + contract; sse = stream + http + protocol; docs = contract + protocol + http; openapi = docs; codegen = docs; swr = contract (peer swr); mvc-kit = contract (peer mvc-kit >= 4.9.0); message = protocol; message-server = message + server + protocol (never client); message-client = message + client + protocol (never server prod); astro server entry depends on server-http + server + contract (type-only); astro client entry depends on client-http + client + contract (type-only); neither entry imports the other side; peer astro; root `.` is client-only because check-exports requires `.`. No `TransportHandler`. Stdio is not on the main index.
- Public exports: protocol = `PFError`, `PFErrorInit`, `isPFError`, `localFailure`, `ProtocolErrorCode`, `PROTOCOL_MAJOR`, `PROTOCOL_VERSION`, envelope types, `PFResultPromise`, `toWireError`, `isAsyncIterable`, `defined` / `Defined`. Not `JSONCodec` / `RpcCodec` / `PROTOCOL_HEADER` / path helpers. server = implementer, local client, `runProcedure`, `lookupProcedure`, middleware types, `ImplementedProcedure<TContract, TCtx>` / `ImplementedRouter<T, TCtx>` / `RouterImpl<T, TCtx>` (branded), `CallInterceptor`, `CallPlugin`, `applyPlugins`, `onStart` / `onSuccess` / `onError` / `onFinish`, `RunProcedureOptions`, `ProcedureValidation`, `DedupePlugin`, `DedupePluginOptions`. Not `FetchHandler` / `HandlerPlugin` / `runCallInterceptors`. client = `createClient`, `Link`, `asResult`, `CallResult`, `isLocalFailure`, `intercept`, `CallInterceptor`, `CallPlugin`, `applyPlugins`, `onStart` / `onSuccess` / `onError` / `onFinish`, `RetryPlugin`, `RetryPluginOptions`, `DedupePlugin`, `DedupePluginOptions`, `CachePlugin`, `CachePluginOptions`. Not `FetchLink` / Fetch `Interceptor` / `runCallInterceptors`. http = `JSONCodec`, `RpcCodec`, `RpcEncodedBody`, `RpcBodySource`, `RpcEncodedText`, `EnvelopeTextCodec`, `PROTOCOL_HEADER`, path helpers, `httpStatus`, `PROTOCOL_HTTP_STATUS`, `mimeType`, `isJsonContentType`, `jsonBodySource`. message = frames, `MessageSession`, `Duplex`, `encodeFrame` / `decodeFrame`, duplex adapters, `errorFromEnvelope`, `createPushQueue` / `PushQueue` (`localFailure` re-export is `@deprecated`). message-server = `DuplexHandler`, `PortHandler`, `WsHandler`, `HandlerOptions`, `WebSocketLike` (`StdioHandler` on `./stdio` only; not `attachRouter`, not the duplex adapters). message-client = `DuplexLink`, `PortLink`, `WsLink`, `LinkOptions`, `WebSocketLike` (`StdioLink` on `./stdio` only; not the duplex adapters). server-http = `FetchHandler`, `FetchHandlerOnError`, `HandleResult`, `HandlerPlugin`, CORS/limit/header plugins + option/context types. client-http = `FetchLink`, `Interceptor`. file = `MultipartCodec`. stream = `StreamCodec` + `stream()`. sse = `SseCodec` + `SSE_CONTENT_TYPE`. Server does **not** export `createErrorFactory` / `finalizeDeclaredError`. Links have `close()` on message-client impls; do **not** add `close()` to `Link`. astro `.` and `./client` export `createAstroClient` and `withBase`; `./server` exports `createAstroHandler`, `createAstroLocalClient`, and `withBase`. `.` does not export `createAstroHandler`.
- `isLocalFailure` is `local === true`, not `status === 0`.
- `PFError.status` stays optional with no constructor default. `FetchLink` (HTTP response status), `createErrorFactory` (declared `ErrorDef.status`), and `localFailure` (`0`) set it; codec `BAD_REQUEST` throws and message-server hello errors carry an explicit `status: 400` that `httpStatus()`'s protocol table overrides. `errorFromEnvelope`, `StreamCodec`, and `SseCodec` do not stamp one (no 400, no 200).
- `FetchHandler` uses `httpStatus(error)` for `Response.status`. Protocol codes map to the HTTP table; other codes use `error.status ?? 400`. `METHOD_NOT_ALLOWED` is Fetch-only emission.
- `FetchLink` rethrows `PFError` from `decodeResponse` only when `x-ts-pf-protocol` is present. A response `x-ts-pf-protocol` that is present and not `PROTOCOL_VERSION` (trimmed) is rejected before decode (body unread) as `INTERNAL` + HTTP status + `Unsupported protocol version (x-ts-pf-protocol: <value>)` + `cause` = the `Response` — not `local` (it came from a server; `isLocalFailure` false, not retried by default), same shape as the non-RPC wrap. Non-RPC decode wrap uses HTTP status, not `local: true`. `FetchLink` binds fetch to `globalThis`. Streamed `ReadableStream` responses get anti-buffering headers.
- One version source: `PROTOCOL_MAJOR` (`1 as const`) in protocol `envelope.ts`; `PROTOCOL_VERSION` is `` `${PROTOCOL_MAJOR}` `` (type `'1'`, still the string inside `catalog()` / `catalogHash()`). Message `frame.ts` / `session.ts` use `PROTOCOL_MAJOR` for `v`, never a numeric literal. `packages/protocol/tests/protocol-md.test.ts` asserts every `x-ts-pf-protocol:` and `"v":` example in `PROTOCOL.md` matches the constants.
- Message backpressure: `Duplex.send` is `void | Promise<void>`; `MessageSession.send` stays synchronous and surfaces the promise as `SendResult.drained` (resolves on drain or close; a rejection closes). Only `item` / `in-item` senders await it; `result` / `done` / `cancel` / `hello*` and `onHello` have no new await. Server drain timeout: abort signal, `iterator.return()` once, frames dropped, terminal `INTERNAL` `Peer did not drain within <n> ms`, `onStall('aborted')`, no `onError`, connection open. Client drain timeout: `localFailure` with the same message, `cancel`, input `return()` once. Receive queues are bounded in frame text length and pause the duplex (`pause?.()`) connection-wide; nothing is dropped. One `BackpressureOptions` (`highWaterMark` 1 MiB / `drainTimeout` 30 s / `onStall` warn; `Infinity` / `0` / `false` are the escape hatches), validated in every constructor including `WsLink`. `PROTOCOL.md` "Backpressure" documents the server-side condition; no wire bytes change.
- Procedure completeness: `impl.router()` rejects missing/extra keys, a handler under another procedure's key, and a slice with a different `$context` (types, naming the key) and missing/extra keys (runtime). Adapters (`FetchHandler`, message handlers, `createLocalClient`, Astro) infer `TCtx` from the router-level brand only (a tree not produced by `impl.router()` infers `unknown`); `new FetchHandler<AppCtx>(app)` still compiles. Brand members are `?: X | undefined` so a mismatch is TS2322, not TS2375. `RouterImplCheck` / `MissingProcedures` / `UnexpectedKeys` / `PresentProcedures` / `ContractShape` / `ContractKeys` stay internal (not on the package index); `IsContractProcedure` / `InferContractProcedure` are `@ts-pf/contract` exports, the only builder-or-`ContractProcedure` match (no new per-package `ContractBuilder<infer …>` copies; `swr/src/types.ts` `InferProc` is the one left to migrate). A symbol used only in its own file is not `export`ed, so Biome can flag it when it goes dead.
- Errors: unknown throws → `INTERNAL`, no stack in JSON — always via `toWireError` (`FetchHandler` error response, message-server `result` frame, JSONL / SSE in-band failure lines); do not hand-write `{ code: 'INTERNAL', message: 'Internal server error' }` or re-implement `toJSON()` at a new site that maps a thrown value (the message `hello-error` for a throwing `onHello` and the message-server oversize / stringify substitute `result` frame are fixed `PROTOCOL.md` literals, not throw mappings). Sites keep the original thrown value for `onError` / logging and pass it to `toWireError` only for the wire. `FetchHandler` logs them with `console.error` unless `onError` is set. Stream detection is protocol `isAsyncIterable` (client/server plugins, `runProcedure` output wrap) or a local `isItemStream` composing it with the `ReadableStream` exclusion (stream, sse, message-server, message-client; swr and mvc-kit keep a copy because they do not depend on protocol). Input checks default on. Output checks, including stream output items, default off (`validation.output: true`). Unary output schema failure → `INTERNAL`, no issues. A bad stream output item → `VALIDATION` with `issues`. Invalid declared error `data` → `INTERNAL`, never serialize the bad payload (always, not behind `validation.output`). `ClientError` narrows `data` from `code`; `status?: number` is transport metadata (HTTP response status over Fetch, `undefined` on message / mid-stream, `0` local). `asResult` is `CallResult<T, E>`.
- Protocol error-code edits update every copy of the closed set: (1) `ProtocolErrorCode` in `packages/protocol/src/error.ts` (source of truth), (2) the duplicated **private** `ProtocolErrorCode` union in `packages/contract/src/infer.ts` (exported as `ContractProtocolErrorCode`; still no protocol import), (3) `PROTOCOL_HTTP_STATUS` in `packages/http/src/http-status.ts`, (4) `packages/docs/src/catalog.ts` — derived from (1) + (3), so it needs no edit but its `VALIDATION` data branch may, and (5) the "Protocol errors" table in `packages/protocol/PROTOCOL.md`. Conformance tests: `packages/http/tests/protocol-table.test.ts` (3 = 1 codes; 3 = 5 statuses), `packages/server/tests/protocol-error-code.test.ts` (2 = 1, type), `packages/protocol/tests/protocol-md.test.ts` (5 = 1 codes).
- `npm run lint && npm run lint:root && npm run check:skills && npm run check:deps && npm run type-check && npm test && npm run build && npm run check:exports && npm run check:snippets`
- Published-package changes include a `.changeset/*.md`. Releases publish to npm dist-tag `latest`. New published packages: `license` / `LICENSE` copy / `engines.node >=20` / `exports` → `dist` / `publishConfig.access` only / `files: ["dist", "skills"]` / `keywords` / `skills/ts-pf-<pkg>/SKILL.md` / tsconfigs extend `tsconfig.base.json` or `tsconfig.dom.json` / `vitest.config.ts` uses `selfAlias` from `vitest.shared.ts`. Do not restore `"*"` after a version bump.
- Matching `packages/<pkg>/skills/ts-pf-<pkg>` still matches public exports and names. Hub `ts-pf-app` description still names opt-in capabilities. `skills/README.md` lists every published skill path. Published `package.json` files include npm `keywords` (shared family terms plus package-specific). `npm run check:skills`.
