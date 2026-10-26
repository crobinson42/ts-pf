# ts-pf rules

Rationale for each lock: [`DECISIONS.md`](../DECISIONS.md).

Contract-first TypeScript RPC library (`@ts-pf/*`). oRPC-like DX is the bar; oRPC's surface area is not. One procedure model. Every wire is an adapter. Do not grow the core into a dual-protocol platform.

## Packages

```
@ts-pf/contract          @ts-pf/protocol
     |     \               / |  |  \
     |      \             /  |  |   \
     v       v           v   v  v    v
 @ts-pf/server  @ts-pf/client  @ts-pf/http  @ts-pf/message
     |              |            /   \         /      \
     v              v           v     v       v        v
 @ts-pf/server-http  @ts-pf/client-http      message-server
                                            message-client

@ts-pf/file     → http + protocol
@ts-pf/stream   → http + protocol + contract
@ts-pf/sse      → stream + http + protocol

@ts-pf/message-server → message + server + protocol
@ts-pf/message-client → message + client + protocol

@ts-pf/docs     → contract + protocol + http
@ts-pf/openapi  → docs
@ts-pf/codegen  → docs
@ts-pf/swr      → contract (peer swr)
@ts-pf/mvc-kit  → contract (peer mvc-kit >= 4.9.0)
@ts-pf/astro/server → server-http + server + contract (type-only; peer astro >= 4.9.0)
@ts-pf/astro        → client-http + client + contract (type-only; `.` / `./client`; peer astro >= 4.9.0)
@ts-pf/mcp          → contract + docs + server + protocol (`./meta` no deps; `./sdk` peer @modelcontextprotocol/server >=2.3.0 <3)
```

- `contract` and `protocol` are siblings. Neither depends on the other.
- `server` and `client` each depend on both. They do **not** depend on `@ts-pf/http`.
- **Client never depends on server. Server never depends on client.**
- `server-http` never depends on `client-http`. `client-http` never depends on `server-http` (prod).
- `@ts-pf/http` is wire helpers only (codec, header, URL path, `httpStatus`, content-type / body-source helpers for wrapping codecs). No `FetchHandler`. No `FetchLink`.
- `@ts-pf/file` depends on `http` + `protocol`. `@ts-pf/stream` depends on `http` + `protocol` + `contract` (`stream()` schema). `@ts-pf/sse` depends on `stream` + `http` + `protocol`. All three are opt-in; default handler/link stay JSON.
- `@ts-pf/message` depends on `protocol` only. `@ts-pf/message-server` depends on `message` + `server` + `protocol` (never client, prod or dev). `@ts-pf/message-client` depends on `message` + `client` + `protocol` (never server in prod; one-way `message-server` **devDependency** for e2e).
- `@ts-pf/docs` depends on `contract`, `protocol`, and `http` (header name, `joinProcedurePath` for href, `PROTOCOL_HTTP_STATUS` for `protocolErrors`). Not imported by core.
- `@ts-pf/openapi` depends on `docs`. `@ts-pf/codegen` depends on `docs`. `@ts-pf/swr` depends on `contract` only (peer `swr`). `@ts-pf/mvc-kit` depends on `contract` only (peer `mvc-kit >= 4.9.0`).
- `@ts-pf/astro` `./server` depends on `server-http`, `server`, and `contract` (type-only, for `ContractClient`). `.` and `./client` depend on `client-http`, `client`, and `contract` (type-only). The server entry never imports the client entry. The client entry never imports the server entry. Peer `astro >= 4.9.0`. Root export is client-only.
- `@ts-pf/mcp` depends on `contract`, `docs` (`toJsonSchema`, `getDocs`, `walkContract`), `server` (`runProcedure`, `lookupProcedure`, `createLocalClient`, `isImplementedProcedure`), and `protocol` (`toWireError`, `PFError`, `isPFError`, `defined`); from `contract` it uses `validateSchema` and `isContractProcedure`. `./meta` imports nothing (contract files import only it). `./sdk` adds the optional peer `@modelcontextprotocol/server >=2.3.0 <3`. Never `client`, `client-http`, or `server-http` in prod (tests may, as **devDependencies**, to bind a `createClient` proxy over a `FetchLink` to a `FetchHandler`); never `message-*` or `@modelcontextprotocol/sdk` (v1). The `./sdk` floor is tested by the `mcp-sdk-floor` CI job; the mcp package and example dev ranges start at it (`^2.3.0`) so one hoisted SDK copy serves both.
- Routers are nested objects, not a package.

| Package | Owns |
|---|---|
| `contract` | `procedure`, `router`, schema adapters, typed errors (`ClientError` discriminated union, `InferErrorData`, `InferContractErrors`), infer types (`InferContractProcedure<T>` / `IsContractProcedure<T>` are the one builder-or-`ContractProcedure` match; `server` derives from them. `swr/src/types.ts` still carries a private `InferProc` copy — replace it with `InferContractProcedure` on the next `swr` change; do not add new copies) |
| `protocol` | `PFError`, JSON envelope types, `PROTOCOL_MAJOR` (the wire major, `1 as const`; `v` on message `hello` / `hello-ok`) and `PROTOCOL_VERSION` (its decimal string, the `x-ts-pf-protocol` value; derived, so there is one version source — no other numeric `1` version literals in `@ts-pf/message`), `localFailure`, `toWireError` (the one thrown-value → wire `error` mapping: `PFError` → `toJSON()`, else `INTERNAL` / `Internal server error`; the message `hello-error` for a throwing `onHello` and the message-server oversize / stringify substitute frame are fixed `PROTOCOL.md` literals, not throw mappings), `isAsyncIterable` (the one "is this a stream" predicate; no `ReadableStream` exclusion — wire sites that want bytes compose it as a local `isItemStream`), `defined` / `Defined` (strip `undefined`-valued keys; the `exactOptionalPropertyTypes` helper for construction-time option bags, e.g. `astro` link/client options; the `message`, `message-server`, and `message-client` spreads are not migrated yet. Per-call hot paths — `server` `runtime.ts` / `call-interceptor.ts` / `events.ts` / `error-factory.ts` / `caller.ts`, `client` `call-interceptor.ts` / `events.ts` / `client.ts` — do not call it: they build the object with its required keys and assign each optional key only when present; `npm run bench` guards it. New non-hot-path code uses `defined`, no new `...(x ? { x } : {})` spreads where `protocol` is a dependency). No HTTP server. No schemas. No `RpcCodec`. Failure JSON is `{ code, message, data? }` only (`toJSON` omits `status`, `cause`, and `local`). `ProtocolErrorCode` is a closed set. |
| `server` | `createImplementer`, middleware, `runProcedure`, `lookupProcedure`, `createLocalClient`, `ProcedureValidation`, `CallInterceptor` / `CallPlugin` / `applyPlugins`, event helpers (`onStart` / `onSuccess` / `onError` / `onFinish`), `DedupePlugin`. Interceptors and `validation` attach per caller, not on `createImplementer`. Duplicate `CallInterceptor` types — do not import from client. `ErrorFactory` is typed on `ProcedureBuilder.handler` from that procedure’s map; `MiddlewareFn.errors` stays the default/loose factory. `finalizeDeclaredError` is internal (`runProcedure` only, not exported). Not `runCallInterceptors`. `impl.router()` returns `ImplementedRouter<T, TCtx>` with leaves `ImplementedProcedure<TContract, TCtx>` (phantom contract + `$context` brands, declared `?: X \| undefined` so mismatches are plain TS2322 under `exactOptionalPropertyTypes`; defaults are unbranded; runtime shape unchanged). Public branded types: `ImplementedRouter`, `ImplementedProcedure`, `RouterImpl`. `router` is `<I>(impl: I & RouterImplCheck<T, TCtx, I>)`: a missing / extra key, a handler under another key, or a slice with a different `$context` is a type error naming the key. `RouterImplCheck`, `MissingProcedures`, `UnexpectedKeys`, `PresentProcedures`, `ContractShape` (contract's `InferContractProcedure` minus `meta`), and `ContractKeys` are internal helper types in `runtime.ts` (exported there for `implement.ts`, **not** from `@ts-pf/server`); do not document them as importable. `IsContractProcedure` comes from `@ts-pf/contract`. `createLocalClient` types `context` from `TCtx` via `NoInfer`. Only the router-level brand is read: a tree not produced by `impl.router()` infers `unknown` even with branded leaves — use `impl.router()` (or pick procedures into a second `impl.router()` call) to keep the check. |
| `client` | `createClient`, `Link`, `intercept` / `CallInterceptor` / `CallPlugin` / `applyPlugins`, event helpers (`onStart` / `onSuccess` / `onError` / `onFinish`), `RetryPlugin` / `DedupePlugin` / `CachePlugin`, `asResult` / `CallResult<T, E>` (do not widen with `E \| PFError`), `isLocalFailure` (`local === true`). Not Fetch `Interceptor`. Not `runCallInterceptors`. `createClient<T = never>`: without `T` the result is `{ '~error': 'Pass createClient<typeof contract>(link)' }`, not `{}`; a `ContractClient<typeof contract>` annotation still infers `T`. |
| `http` | `JSONCodec`, `RpcCodec`, `RpcEncodedBody`, `RpcBodySource`, `PROTOCOL_HEADER`, `joinProcedurePath`, `parseProcedurePath`, `httpStatus`, `PROTOCOL_HTTP_STATUS`, and the shared scaffolding of the wrapping codecs: `EnvelopeTextCodec` / `RpcEncodedText` (the `inner` role of `MultipartCodec` / `StreamCodec` / `SseCodec` — an `RpcCodec` whose encoded bodies are strings; `JSONCodec` implements it; handlers and links still take any `RpcCodec`), `mimeType`, `isJsonContentType`, `jsonBodySource`. No per-package copies of those helpers. |
| `server-http` | `FetchHandler`, `HandlerPlugin` (`CORSPlugin`, `RequestLimitPlugin`, `RequestHeadersPlugin`, `ResponseHeadersPlugin`), `FetchHandlerOnError`. `FetchHandler` accepts `interceptors?: CallInterceptor[]`, `validation?: ProcedureValidation` (from `@ts-pf/server`), and `onError?` (side-effect only; default `console.error` for unknown throws when absent) separate from `plugins?: HandlerPlugin[]`. `FetchHandler<TCtx>` infers `TCtx` from `app`'s context brand (`ImplementedRouter<unknown, TCtx>` constructor param); `handle(request, { context })` is typed with it; explicit `new FetchHandler<AppCtx>(app)` stays accepted when `AppCtx` satisfies the brand. `FetchHandler` reads the request `x-ts-pf-protocol`: absent → accept; present and not `PROTOCOL_VERSION` (trimmed) → `BAD_REQUEST` `Unsupported protocol version` (400), checked after the method check and before lookup / body read, through the same error path as 405 / 404. A `HandlerPlugin` that rewraps the request builds `new Request(request.url, { method, headers, signal, body, duplex })`, never `new Request(request, init)`: userland bridges hand over Request-shaped objects undici cannot clone (srvx on Node). Every step after a rewrap sees the plain `Request` (later `onRequest`s, the context factory, every `onContext` / `onResponse` / `onError`, the `onError` option); `RequestLimitPlugin` rewraps whenever the request has a body. |
| `client-http` | `FetchLink`, Fetch `Interceptor`. `FetchLink` sends `x-ts-pf-protocol: 1`; a response whose `x-ts-pf-protocol` is present and not `PROTOCOL_VERSION` (trimmed) is not decoded — `INTERNAL` + HTTP status + `Unsupported protocol version (x-ts-pf-protocol: <value>)` + `cause` = the `Response`, not `local` (it came from a server; `RetryPlugin` does not retry it by default). |
| `file` | `MultipartCodec` only. Do not add `PFFile`, `file()`, or export walk helpers. |
| `stream` | `StreamCodec` + `stream()`. Root `AsyncIterable` as JSONL envelopes. |
| `sse` | `SseCodec` + `SSE_CONTENT_TYPE`. Output-only `text/event-stream`. |
| `docs` | `catalog()`, `docs()` meta helper (keeps `tags` / `hidden` literal in its return type, for `@ts-pf/mcp`'s type-level filters; other fields stay `DocsMeta`), `getDocs`, `walkContract`, `toJsonSchema`, `registerJsonSchemaConverter` (`getDocs` / `toJsonSchema` / `walkContract` are also what `@ts-pf/mcp` builds tool definitions from). |
| `openapi` | `openapi(catalog, options)` → OpenAPI 3.1. POST JSON RPC only. |
| `codegen` | `emit(catalog)`, `catalogHash()`, `EmitOptions`, CLI `ts-pf-codegen`. |
| `swr` | `createSwr(client)` helpers for SWR. |
| `mvc-kit` | `bindClient(client, host)` / `issuesToFieldErrors` / `DisposeSignalHost`. |
| `astro` | `createAstroHandler`, `createAstroLocalClient` (`./server`); `createAstroClient`, `withBase` (`.` and `./client`). Peer `astro >= 4.9.0`. Root export is client-only. `context` on `createAstroHandler` / `createAstroLocalClient` is typed from the app's `TCtx` (`NoInfer`); `createAstroClient<T = never>` follows the `createClient` `~error` rule. |
| `mcp` | `mcp()` (`./meta`, no deps; `const` type parameter keeps `effect` literal); `createToolkit` (contract-mirroring builders; root members `$context` / `$tool` / `$host` / `$toolset` / `$coverage`; a contract key starting with `$` at any depth is a type error naming the key), `all`, `bindTools`, `audit`, `McpTools` / `McpCallInfo` / `McpToolDefinition` / `McpToolResult` (root; plus type-only exports of the inferred builder / toolset types so consumers can export toolsets under `declaration: true`); `createMcpFactory` (`./sdk`: a fresh `McpServer` per request with passthrough schemas; from an `app` or bound `McpTools`). Tools carry a required runtime `'~tool'` brand. Tool name = path joined with `_`, or the toolset object key. Unclassified = `write`. Description: `.describe()` → `mcp({ description })` → `docs()` description → summary. Call-pipeline options live on the `bindTools` executor (`{ app, context, interceptors?, onError?, maxResultChars? }`; the client form has `onError?` / `maxResultChars?` and a `context` required when the toolkit's context type has required keys); `createMcpFactory(app, …)` takes and forwards the app-form options; the `McpTools` form takes only `{ name, version, instructions?, listTtlMs? }`. `McpCallInfo.tool` (`{ name, path }`) is set before `context` runs; interceptors see the procedure path only. `.visible(info => boolean)` (builders, `all({ visible })`, `$tool({ visible })`, `$host({ visible })`) filters `McpTools.list` per caller and makes `call` answer a hidden tool like an unknown one (host inner tools: discovery, the `get_*` description and `category` enum, the `call_*` enum, and annotations follow the caller's visible set); predicates get `McpCallInfo` only, never `context`. `.scopes([...])` (and `all` / `$tool`) is a step-up hint: `McpTools.scopesFor?(name, args, info?)` (async; for `call_*`, the inner tool's; empty when hidden from the caller) → `./sdk` registers `scopeChallenge`, a `403 insufficient_scope` over HTTP listing granted ∪ required scopes; stdio and `McpTools.call` never enforce it (middleware does). `all({ tags })` and literal `docs({ hidden: true })` filter at the type level too (from `docs()`'s literal `tags` / `hidden`); `$coverage` counts literal-hidden procedures as decided. Unknown throws → `toWireError` text, `console.error` unless `onError` (the `FetchHandler` default). |
| `message` | JSON text frames + `MessageSession` / `Duplex` + port/ws/stdio duplex adapters + `createPushQueue` / `PushQueue` (the one push-to-`AsyncIterable` queue, one-shot `end()` / `fail()`, bounded by `PushQueueOptions` `{ highWaterMark, onPause, onResume }` with `push(value, size)`; message-server input and message-client output use it, no local copies) + the shared backpressure primitives: `BackpressureOptions` / `StallInfo` (the one option object both bindings take), `resolveBackpressure` (defaults 1 MiB / 30 s / `console.warn` on `aborted` only; `TypeError` naming the option) and `DrainWaiter` (the per-call drain wait; `onStall('paused')` once, `onStall('aborted')` on timeout; resolves before it notifies and swallows `onStall` throws; a second concurrent `wait` throws) — both exported `@internal` for the two bindings, not listed as consumer API. `MessageSession` keeps pending drain resolvers in a `Set` flushed by `enterClosed` (never a `.then` on a long-lived close promise per send). `Duplex.send` is `void \| Promise<void>` (a promise = above the write mark; must settle on close; rejection closes) and `Duplex` has optional `pause` / `resume`. `SendResult` carries `drained?`; `MessageSession.onFrame(frame, size)` passes the frame text length. stdio honours `write()` / `'drain'` and `input.pause()`; ws polls `bufferedAmount` against `createWsDuplex(socket, { highWaterMark })` every 10 ms and forwards `pause` / `resume` when the socket has them; port reports nothing (no buffer signal, cannot pause); `createMemoryDuplex({ highWaterMark })` simulates a slow peer (sync without it). `localFailure` is a `@deprecated` re-export; import it from `@ts-pf/protocol`. |
| `message-server` | `DuplexHandler` (the multiplexer: `bind(duplex, { context })` over any `@ts-pf/message` `Duplex`), `PortHandler`, `WsHandler`, `StdioHandler` (`./stdio` only) — the three build their duplex and delegate to `DuplexHandler`. Calls `lookupProcedure` + `runProcedure`. `HandlerOptions` may include `interceptors`, `validation`, and `backpressure` (on by default; validated in the constructor). Output streams: `emitStream` awaits `SendResult.drained` between items, so the generator parks at its `yield`; after `drainTimeout` that call is aborted (signal, `iterator.return()` once, frames dropped, terminal `INTERNAL` / `Peer did not drain within <n> ms` via `sendResultErr` if the socket accepts it, `onStall('aborted')`, **not** `onError`) and the connection stays open. Input streams: the `in-item` queue is bounded by `highWaterMark` (frame text length) and the connection pauses reads via `duplex.pause?.()` while any queue is over it. Handlers infer `TCtx` from `app` like `FetchHandler`; `bind(..., { context })` is typed with it. `attachRouter` / `ServerCall` stay internal; `BackpressureOptions` / `StallInfo` are type re-exports. |
| `message-client` | `DuplexLink` (the multiplexer: `Link` over any `@ts-pf/message` `Duplex`), `PortLink`, `WsLink`, `StdioLink` (`./stdio` only) — the three build their duplex and delegate to `DuplexLink`. Implements `Link`. `LinkOptions.backpressure` is the same object as the server's (on by default; validated in the constructor, `WsLink` included). Input pump: `pumpInput` awaits `SendResult.drained` between `in-item`s; after `drainTimeout` the call fails with `localFailure('Peer did not drain within <n> ms')`, `cancel` is sent if the socket accepts it, and the input iterator's `return()` runs once. Output queues are bounded by `highWaterMark` and pause reads via `duplex.pause?.()`. Uses protocol `isPFError` / `localFailure` / `isAsyncIterable` directly (no duck-typed `PFError` check, no local predicate copy). `ClientCall` stays internal; `BackpressureOptions` / `StallInfo` are type re-exports. |

## Public names

Do not resurrect oRPC names in code, docs, or examples.

| Use | Not |
|---|---|
| `procedure` / `router` | `oc` |
| `createImplementer` / local `impl` | `implement` / `os` |
| `FetchHandler` / `PortHandler` / `WsHandler` / `StdioHandler` / `DuplexHandler` | `RPCHandler` / `TransportHandler` |
| `CORSPlugin` / `RequestLimitPlugin` / `RequestHeadersPlugin` / `ResponseHeadersPlugin` / `RetryPlugin` / `DedupePlugin` / `CachePlugin` | `*HandlerPlugin` / `*LinkPlugin`. Keep interface `HandlerPlugin`; `CallPlugin` is a different type. |
| `createLocalClient` | `createRouterClient` |
| `asResult` | `safe` |
| `FetchLink` / `PortLink` / `WsLink` / `StdioLink` / `DuplexLink` | `RPCLink` |
| `bind` | `upgrade` |
| `stream()` | `eventIterator` |
| `createSwr` | `createSWRUtils` / `createRouterUtils` / `swrUtils` |
| `bindClient` | `bind` as a client wrapper / `createMvc` / `createRouterUtils`. `PortHandler.bind` is unchanged. |
| `createAstroHandler` / `createAstroLocalClient` / `createAstroClient` | `RPCHandler` |
| `emit` / `catalogHash` | `generate` / `compile` as the only names; `digest` as the only hash name |
| `ts-pf-codegen` | `pf` |
| generated `Contract` | `AppRouter` |
| nested `router({ planet: planetContract })` | `mergeRouters` / `compose()` |

Implemented routers in examples: `app`, not `router` (that name is the contract helper).

## v1 locks

- Contract-first only. No server-first builder whose output is inferred from the handler.
- One procedure model. Pipes are adapters. Fetch is not privileged inside `@ts-pf/server` or `@ts-pf/client`.
- Spec: `packages/protocol/PROTOCOL.md`. Envelope is `{ input }`, `{ ok: true, output }`, `{ ok: false, error: { code, message, data? } }`. Optional `multipart/form-data` (`@ts-pf/file`), `application/jsonl` (`@ts-pf/stream`), `text/event-stream` (`@ts-pf/sse`) wrap the same envelopes over HTTP. Optional message transports wrap the same envelopes over WebSocket, stdio, and MessagePort.
- Versioning: one wire major, `PROTOCOL_MAJOR = 1` in `@ts-pf/protocol` (`x-ts-pf-protocol: 1` over HTTP, `v: 1` on message `hello` / `hello-ok`; `PROTOCOL_VERSION` is its string). `PROTOCOL.md` revisions (1.1, …) are additive and keep the major: a receiver never rejects a value that 1.0 defined as valid, and a 1.x sender emits a new key / frame / header / content type only on opt-in. `FetchHandler` and the message server reject another major with `BAD_REQUEST` `Unsupported protocol version`; `FetchLink` rejects it with `INTERNAL` + HTTP status + `Unsupported protocol version (x-ts-pf-protocol: <value>)` (not local — the response came from a server); the message client fails locally with `Invalid response` (no `hello-ok` was accepted). Bump the major only when the JSON envelope, a required frame field, or the handshake changes.
- Server runtime: `runProcedure` / `lookupProcedure`. `FetchHandler` is Fetch `Request` / `Response` only, in `@ts-pf/server-http`. Message adapters live in `@ts-pf/message-server`.
- `.output()` is optional (`unknown` if omitted). `.input()` once; no stacked merge/pipe.
- `.use()` runs **before** input validation (`input: unknown`) and takes the same loose `MiddlewareFn<TCtx, unknown, unknown>` on `impl.use()` and on a per-procedure `.use()`, so an `impl.middleware()` result fits both. `.useAfter()` runs **after** (typed input when the input check ran) and is typed per procedure. Input checks default on. `validation.input: false` skips them, including stream input items, and `.useAfter()` then sees the raw value.
- `$context<C>()` is the only source of context types. `impl.router()` brands the tree with it (`ImplementedRouter<T, TCtx>`, leaves `ImplementedProcedure<TContract, TCtx>`); `FetchHandler`, the message handlers, `createLocalClient`, and `@ts-pf/astro` infer `TCtx` from the brand and type `context` with it. Trees not produced by `impl.router()` infer `unknown` (only the router-level brand is read); use `impl.router()`, or pick procedures into a second `impl.router()` call, to keep the check. Middleware still does not infer added keys.
- Client-side input validation is off by default.
- Output checks, including stream output items, default off. `validation.output: true` runs them. Unary output schema failure is `INTERNAL` with no `issues` (input failure stays `VALIDATION`). A bad stream output item stays `VALIDATION` with `issues`. Invalid declared error `data` is always `INTERNAL` (not behind the output flag). HTTP status for those codes is mapped by `httpStatus()` in `@ts-pf/http` (500 / 422), not stamped by `runProcedure`. Parsed output (strip, defaults, transforms) is applied only when output checks run.
- Discriminator is JSON `error.code`. HTTP status is transport-only; never put `status`, `cause`, or `local` in the envelope.
- `PFError.status?: number` is optional transport metadata, not identity, and has **no default**. It is set only where a transport really has one: `FetchLink` stamps the HTTP response status on unary failures; `createErrorFactory` stamps a declared `ErrorDef.status` (and nothing when the definition omits it); `errorFromEnvelope` (message transports) and mid-stream JSONL / SSE failures leave it `undefined`. Codec `BAD_REQUEST` throws and message-server hello errors carry an explicit `status: 400` that the protocol table overrides on HTTP anyway. `httpStatus()` in `@ts-pf/http` is the only runtime place the HTTP default (400) lives: protocol codes → `PROTOCOL_HTTP_STATUS`, else `error.status ?? 400` (`@ts-pf/openapi` mirrors the same default when documenting declared errors). `ErrorDef.status` is optional HTTP / OpenAPI metadata.
- Local failures: `localFailure()` → `INTERNAL` with `local: true` and `status: 0`. `isLocalFailure` is `local === true`, never `status === 0`. That status is not on the wire and is not a protocol status. Abort message is `Request aborted`.
- Keep `ProtocolErrorCode` duplicated as a private union in `packages/contract/src/infer.ts`. Do not import `@ts-pf/protocol` from contract.
- `METHOD_NOT_ALLOWED` stays in the closed set; only FetchHandler emits it. `PAYLOAD_TOO_LARGE` is shared (HTTP body cap + message outbound oversize).

**Not in core:** OpenAPI runtime / REST / Scalar, error-catalog RPC, Node `IncomingMessage` adapters, framework adapters, TanStack Query, lazy routers, `mergeRouters` / `compose()`, Map/Set on the wire, EventSource clients, Last-Event-ID, EventPublisher. Feature slices nest `router({ planet: planetContract })` and `impl.router({ planet: planetApp })`. Each server exports one contract; clients import that contract only. File/Blob is `@ts-pf/file`. Message streams are `@ts-pf/stream`. SSE output framing is `@ts-pf/sse`. Procedure catalogs are `@ts-pf/docs`. OpenAPI 3.1 documents are `@ts-pf/openapi`. Typed-client `.d.ts` codegen is `@ts-pf/codegen`. Message transports are `@ts-pf/message` / `message-server` / `message-client`. SWR is `@ts-pf/swr`. mvc-kit Resource helpers are `@ts-pf/mvc-kit`. Astro endpoints and page callers are `@ts-pf/astro`. MCP tools are `@ts-pf/mcp`. Fetch is `@ts-pf/server-http` / `@ts-pf/client-http`. Do not add `.docs()` to the contract builder. None of these are core defaults. Do not redeclare `VALIDATION`, `INTERNAL`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, or `PAYLOAD_TOO_LARGE` on `.errors()`.

## Extension (hooks, not a plugin framework)

| Hook | Package |
|---|---|
| `registerSchemaAdapter` | contract |
| `.meta()` / `.$meta()` | contract |
| `.use()` / `.useAfter()` | server |
| `HandlerPlugin` | server-http (`CORSPlugin`, `RequestLimitPlugin`, `RequestHeadersPlugin`, `ResponseHeadersPlugin`) |
| `RpcCodec` | http (`JSONCodec` is the v1 impl) |
| `CallInterceptor` / `CallPlugin` | server (`createLocalClient({ plugins, interceptors })`; `FetchHandler` `{ interceptors }`; message `HandlerOptions.interceptors`; `DedupePlugin`) and client (`createClient(link, { plugins, interceptors })` / `intercept()` around `Link.call`; `RetryPlugin` / `DedupePlugin` / `CachePlugin`). Duplicate types — do not import across the DAG. `onStart` / `onSuccess` / `onError` / `onFinish`. Plugin `name` is debugging, not a registry. Array order only — no `order`/`before`/`after`. Server `next({ context })` replaces. Do not add `close()` to `Link`. First-party plugins skip `AsyncIterable` input. |
| Fetch interceptors | client-http (Fetch `Interceptor`; do not export from `@ts-pf/client`) |
| `docs()` / `catalog()` / `registerJsonSchemaConverter` | docs |
| `openapi()` | openapi |
| `emit` / `catalogHash` | codegen |
| `createSwr` | swr |
| `bindClient` | mvc-kit |
| `createToolkit` / `all` / `bindTools` / `createMcpFactory` | mcp |

`RpcCodec` encode returns `{ contentType, body }` (`string | Blob | FormData | ReadableStream<Uint8Array> | null`). Decode takes `RpcBodySource` (`contentType`, `text()`, `formData()`, `body()`). `JSONCodec` still emits `application/json` and the JSON envelope. `MultipartCodec`, `StreamCodec`, and `SseCodec` wrap it without changing contracts.

`CallOptions` is `{ signal?: AbortSignal }` on `ProcedureClient`. Do not add an oRPC-style ClientContext bag. `createClient` / `createLocalClient` forward it; `FetchLink` sets `RequestInit.signal`; `FetchHandler` passes `request.signal` into `runProcedure` → `HandlerFn` only (not middleware). Typed `ProcedureBuilder.handler` opts include `signal?: AbortSignal`. `FetchLink` sets `duplex: 'half'` when `encoded.body instanceof ReadableStream`. Streamed `ReadableStream` responses also get `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`. `FetchLink` binds `opts.fetch ?? globalThis.fetch` to `globalThis`. Fetch/interceptor catch: rethrow an existing `PFError`; abort/network → `localFailure(...)`. Before decode: an `x-ts-pf-protocol` response header that is present and not `PROTOCOL_VERSION` → `INTERNAL` + HTTP status + `Unsupported protocol version (x-ts-pf-protocol: <value>)` + `cause` = the `Response`, body unread, not `local` (`isLocalFailure` is false; `RetryPlugin` does not retry it by default). `decodeResponse` catch: rethrow a codec `PFError` only when `x-ts-pf-protocol` is present (and therefore matches); no protocol header → `INTERNAL` + HTTP status + `Non-RPC response (HTTP …)` + `cause` (`isLocalFailure` is false). Fetch interceptors see raw fetch throws / `Response`s, not mapped `PFError`; `isLocalFailure` is after the call. Client call interceptors wrap `Link.call` (`path` / `input` / `signal`; `next` may replace `input`/`signal`, not `path`). Server call interceptors wrap `runProcedure` (`procedure` / `path` / `input` / `context` / `signal`; `next` may replace `input`/`context`/`signal`; `context` replaces, does not merge). A server interceptor may call `next()` more than once, concurrently; `runProcedure` keeps `input` / `context` / `signal` per execution (each `next()` gets a fresh `Execution` object that the module-level step functions take as a parameter), never at `runProcedure` scope or in shared closure variables. Empty plugin/interceptor lists are identity (server: a length check on `runProcedure`). Do not add retry to `FetchLink`. Retry/dedupe/cache are `CallPlugin`s wrapping `Link.call` (`RetryPlugin`, `DedupePlugin`, `CachePlugin`). Server in-flight dedupe is `@ts-pf/server` `DedupePlugin`. Fetch `Interceptor`s still must not use `isLocalFailure`. `RetryPlugin` may; it is a call interceptor.

## Code

- ESM-only, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- One job per file. No HTTP in `contract`. No schemas in `protocol`. No `Request`/`Response` in `server` or `client`.
- Tests: Vitest. Type tests: `expectTypeOf` (plus `@ts-expect-error` for must-fail cases) checked by `tsc --noEmit`; `tests/*.test-d.ts` also run under Vitest typecheck (`test.typecheck` in `vitest.config.ts`; contract, server, client). Vitest environment peers (`jsdom`) are root `devDependencies` next to `vitest`, not per-package, so the hoisted `vitest` can resolve them.
- Workspace: npm + Turborepo (`packages/*`, `examples/*`, `examples/codegen/*`). Internal `@ts-pf/*` deps: `"*"` until `changeset version` rewrites them for npm; do not restore `"*"` after a bump. New published packages: `license: "MIT"`, a `LICENSE` copy of the root file (npm packs it regardless of `files`; `check:exports` asserts it), `engines.node >=22`, `exports` → `dist` (mirror extra paths such as `./stdio`), `publishConfig.access: "public"` only (npm does not rewrite `publishConfig.exports`), `files: ["dist", "skills"]`, a `keywords` array (shared `ts-pf` / `typescript` / `rpc` / `typesafe` / `typed-rpc` / `api` / `contract-first` plus package-specific terms), a `skills/ts-pf-<pkg>/SKILL.md` consumer skill (same PR as the package), `tsconfig.json` / `tsconfig.build.json` that extend root `tsconfig.base.json` (no `DOM`) or `tsconfig.dom.json` (adds `DOM`) and hold only per-package keys, and a `vitest.config.ts` whose `resolve.alias` is `selfAlias(import.meta.url)` from root `vitest.shared.ts` (own name and `exports` subpaths → `src`, so tests never run against a stale own `dist`). Lockfile: `package-lock.json`. Build: `tsc -p tsconfig.build.json`. turbo `test` and `type-check` `dependsOn: ["build", "^build"]` because `selfAlias` is Vite-only: `tsc` (type-check and the Vitest typecheck of `*.test-d.ts`) and cross-package imports resolve `@ts-pf/*` to `dist`.
- Consumer skills live in `packages/<pkg>/skills/ts-pf-<pkg>/SKILL.md` (hub `ts-pf-app` is in `contract`). The hub is the capability catalog for packages the consumer has not installed; usage skills version with their package. Update the matching skill in the same PR as a public API / name / happy-path change. If that change is the opt-in happy path, also update the matching snippet on `ts-pf-app`. Do not copy this file into them. Index: `skills/README.md` (not published; no `SKILL.md` there). Downstream install: `npx skills experimental_sync -y`. No library `postinstall`. Do not add a published `@ts-pf/skills` package. A published skill `description` that contains `:` (including `Triggers:`) must be a quoted YAML scalar; `experimental_sync` parses front matter and skips an unquoted `Triggers:`.
- Releases: Changesets, npm dist-tag `latest`. PRs that change a published `packages/*` package include a `.changeset/*.md`. Do not run `changeset pre enter` or add `.changeset/pre.json`. Examples are private and listed in `.changeset/config.json` `ignore` (add new example names there).

## Anti-patterns

- Do not invent `TransportHandler`. `FetchHandler` stays Fetch-only. `PortHandler.bind(port)` stays a different shape. `DuplexHandler` / `DuplexLink` are not that: they are generic only over `@ts-pf/message` `Duplex` *inside* the message family (same frames, same handshake), never a request shape shared with Fetch. A new pipe is a `Duplex` plus those two, not a copy of the multiplexer.
- Do not port `HandlerPlugin` onto WS / stdio / MessagePort.
- Do not reuse `RpcCodec` as a message framer. Reuse envelope types only.
- Do not put `.ws()` / `.stdio()` / `.port()` on procedures.
- Do not fold SSE into `@ts-pf/server-http`. Do not fold WebSocket into `@ts-pf/server-http`.
- Do not put `FetchHandler` back in `@ts-pf/server` or `FetchLink` back in `@ts-pf/client`.
- Do not put `JSONCodec` / `RpcCodec` back in `@ts-pf/protocol`.
- Do not depend on the `ws` npm package. Inject a `WebSocket` constructor.
- `@ts-pf/message-server` never depends on `@ts-pf/client` (prod or dev).
- `@ts-pf/message-client` never depends on `@ts-pf/server` (prod).
- Do not import `@ts-pf/message-server` from `@ts-pf/server`; do not import `@ts-pf/message-client` from `@ts-pf/client` (prod).
- Do not `await runProcedure` inside `MessageSession` (`onFrame` must return without awaiting it).
- Context factory is `onHello`, not `onFrame`.
- Do not rewrite oversize payloads in `session.send`.
- Backpressure is the duplex's signal, never a frame: no `credit` / ack frames in wire major 1 (A8-A is v2). `Duplex.send` returns a promise only above the write mark; `session.send` stays synchronous and returns that promise as `SendResult.drained`, which must settle on close. Only frames with a successor on the same id await it (`item`, `in-item`); `result` / `done` / `cancel` / `hello*` never do. Do not `await` a sync send (`drained` absent) — the unary path and `onHello` stay zero-await. A drain timeout is a stall, not a handler failure: `onStall`, not `onError`; `INTERNAL` with the fixed `Peer did not drain within <n> ms` message, not a new code. Protection is on by default; `highWaterMark: Infinity` is the only spelling of "unbounded". Do not add a second option bag or per-transport knobs: one `BackpressureOptions` on `HandlerOptions` and `LinkOptions`.
- Do not make a receiver drop or reject frames to bound memory; it pauses the duplex (`pause?.()`) where the pipe can, and documents that `MessagePort` and non-`ws` server sockets cannot (npm `ws` 8.x can).
- `onStall` is observability only: it runs after the outcome is decided, its throws are swallowed, and the default logs `aborted` only (never `paused`, which is normal flow control). Do not route a stall through `onError`.
- Do not re-export `createPortDuplex` / `createWsDuplex` / `createStdioDuplex` from `@ts-pf/message-server` or `@ts-pf/message-client`.
- Do not add a published Node HTTP upgrade helper or `child_process.spawn` adapter; user owns listen/upgrade/spawn/Worker bootstrap.
- Do not serve REST or OpenAPI from `FetchHandler`. Do not add GET/PUT/path params to `@ts-pf/openapi` documents. Scalar/Swagger stay userland.
- Do not serve `catalog.json` from `FetchHandler`. No `createClientFromCatalog` in v1.
- Do not reconstruct HTTP status from `error.code` on message transports.
- `@ts-pf/astro/server` is not imported by client islands. `@ts-pf/astro/client` does not import `@ts-pf/server`.
- Do not serve MCP through `FetchHandler` or a message handler (MCP is JSON-RPC 2.0; the SDK v2 owns the transport). Do not build on `@modelcontextprotocol/sdk` v1 or the deprecated low-level `Server`. Do not share one `McpServer` across requests. Contract files import `@ts-pf/mcp/meta` only. No `.rename()` (the toolset key is the name), no automatic switch to hosts by tool count, no resources / prompts in v1.

## Examples

Live in `examples/`: `hello` (Fetch), `codegen` (split-repo `emit` / `createClient<Contract>`), `message` (MessagePort), `stream` (`StreamCodec`), `plugins` (`CallPlugin` / `CallInterceptor`), `mcp` (`@ts-pf/mcp` over the MCP SDK v2, HTTP and stdio, both protocol eras). They are private workspace packages, not published. New examples: `private: true` and append the package name to `.changeset/config.json` `ignore`.

- Implemented routers are named `app` (not `router` — that name is the contract helper).
- Example `client.ts` must not import `@ts-pf/server`.
- Do not add framework adapter packages to satisfy an example. `hello/src/serve.ts` (`npm run dev`) is an example-local `node:http` bridge; do not promote it to a published adapter.
- Do not restore numbered `01-hello` … `15-mvc-kit` or `_shared`.
- Example READMEs keep three sections: "What it shows", "Run", "What the smoke test asserts". Examples are smoke-tested, not "runnable apps"; only `hello` listens.
- Root `vitest.config.ts` lists `test.projects` explicitly (`packages/*` plus each example config); no bare `examples/*` glob (it would load `examples/README.md`).

## Done means verified

```
npm run lint && npm run lint:root && npm run check:skills && npm run check:deps && npm run type-check && npm test && npm run build && npm run check:exports && npm run check:snippets
```

Wire changes must update `packages/protocol/PROTOCOL.md`. Public API / name / happy-path changes must update `packages/<pkg>/skills/ts-pf-<pkg>/SKILL.md` and the `## API` list in `packages/<pkg>/README.md` (`check:skills` cross-asserts them). Opt-in happy-path changes also update the matching snippet on `packages/contract/skills/ts-pf-app/SKILL.md`.
