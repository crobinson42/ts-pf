# ts-pf rules

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

@ts-pf/docs     → contract + protocol + http
@ts-pf/openapi  → docs
@ts-pf/codegen  → docs
@ts-pf/swr      → contract (peer swr)
@ts-pf/mvc-kit  → contract (peer mvc-kit >= 4.9.0)
```

- `contract` and `protocol` are siblings. Neither depends on the other.
- `server` and `client` each depend on both. They do **not** depend on `@ts-pf/http`.
- **Client never depends on server. Server never depends on client.**
- `server-http` never depends on `client-http`. `client-http` never depends on `server-http` (prod).
- `@ts-pf/http` is wire helpers only (codec, header, URL path, `httpStatus`). No `FetchHandler`. No `FetchLink`.
- `@ts-pf/file` depends on `http` + `protocol`. `@ts-pf/stream` depends on `http` + `protocol` + `contract` (`stream()` schema). `@ts-pf/sse` depends on `stream` + `http` + `protocol`. All three are opt-in; default handler/link stay JSON.
- `@ts-pf/message` depends on `protocol` only. `@ts-pf/message-server` depends on `message` + `server` + `protocol` (never client, prod or dev). `@ts-pf/message-client` depends on `message` + `client` (never server in prod; one-way `message-server` **devDependency** for e2e).
- `@ts-pf/docs` depends on `contract`, `protocol`, and `http` (header name + `joinProcedurePath` for href). Not imported by core.
- `@ts-pf/openapi` depends on `docs`. `@ts-pf/codegen` depends on `docs`. `@ts-pf/swr` depends on `contract` only (peer `swr`). `@ts-pf/mvc-kit` depends on `contract` only (peer `mvc-kit >= 4.9.0`).
- Routers are nested objects, not a package.

| Package | Owns |
|---|---|
| `contract` | `procedure`, `router`, schema adapters, typed errors (`ClientError` discriminated union, `InferErrorData`, `InferContractErrors`), infer types |
| `protocol` | `PFError`, JSON envelope types, `PROTOCOL_VERSION`, `localFailure`. No HTTP server. No schemas. No `RpcCodec`. Failure JSON is `{ code, message, data? }` only (`toJSON` omits `status`, `cause`, and `local`). `ProtocolErrorCode` is a closed set. |
| `server` | `createImplementer`, middleware, `runProcedure`, `lookupProcedure`, `createLocalClient`, `CallInterceptor` / `CallPlugin` / `applyPlugins`, event helpers (`onStart` / `onSuccess` / `onError` / `onFinish`), `DedupePlugin`. Interceptors attach per caller, not on `createImplementer`. Duplicate `CallInterceptor` types — do not import from client. `ErrorFactory` is typed on `ProcedureBuilder.handler` from that procedure’s map; `MiddlewareFn.errors` stays the default/loose factory. `finalizeDeclaredError` is internal (`runProcedure` only, not exported). Not `runCallInterceptors`. |
| `client` | `createClient`, `Link`, `intercept` / `CallInterceptor` / `CallPlugin` / `applyPlugins`, event helpers (`onStart` / `onSuccess` / `onError` / `onFinish`), `RetryPlugin` / `DedupePlugin` / `CachePlugin`, `asResult` / `CallResult<T, E>` (do not widen with `E \| PFError`), `isLocalFailure` (`local === true`). Not Fetch `Interceptor`. Not `runCallInterceptors`. |
| `http` | `JSONCodec`, `RpcCodec`, `RpcEncodedBody`, `RpcBodySource`, `PROTOCOL_HEADER`, `joinProcedurePath`, `parseProcedurePath`, `httpStatus`, `PROTOCOL_HTTP_STATUS` |
| `server-http` | `FetchHandler`, `HandlerPlugin` (`CORSPlugin`, `RequestLimitPlugin`, `RequestHeadersPlugin`, `ResponseHeadersPlugin`). `FetchHandler` accepts `interceptors?: CallInterceptor[]` (from `@ts-pf/server`) separate from `plugins?: HandlerPlugin[]`. |
| `client-http` | `FetchLink`, Fetch `Interceptor` |
| `file` | `MultipartCodec` only. Do not add `PFFile`, `file()`, or export walk helpers. |
| `stream` | `StreamCodec` + `stream()`. Root `AsyncIterable` as JSONL envelopes. |
| `sse` | `SseCodec` + `SSE_CONTENT_TYPE`. Output-only `text/event-stream`. |
| `docs` | `catalog()`, `docs()` meta helper, `walkContract`, `registerJsonSchemaConverter`. |
| `openapi` | `openapi(catalog, options)` → OpenAPI 3.1. POST JSON RPC only. |
| `codegen` | `emit(catalog)`, `catalogHash()`, `EmitOptions`, CLI `ts-pf-codegen`. |
| `swr` | `createSwr(client)` helpers for SWR. |
| `mvc-kit` | `bindClient(client, host)` / `issuesToFieldErrors` / `DisposeSignalHost`. |
| `message` | JSON text frames + `MessageSession` / `Duplex` + port/ws/stdio duplex adapters. |
| `message-server` | `PortHandler`, `WsHandler`, `StdioHandler` (`./stdio` only). Calls `lookupProcedure` + `runProcedure`. `HandlerOptions` may include `interceptors`. |
| `message-client` | `PortLink`, `WsLink`, `StdioLink` (`./stdio` only). Implements `Link`. |

## Public names

Do not resurrect oRPC names in code, docs, or examples.

| Use | Not |
|---|---|
| `procedure` / `router` | `oc` |
| `createImplementer` / local `impl` | `implement` / `os` |
| `FetchHandler` / `PortHandler` / `WsHandler` / `StdioHandler` | `RPCHandler` |
| `CORSPlugin` / `RequestLimitPlugin` / `RequestHeadersPlugin` / `ResponseHeadersPlugin` / `RetryPlugin` / `DedupePlugin` / `CachePlugin` | `*HandlerPlugin` / `*LinkPlugin`. Keep interface `HandlerPlugin`; `CallPlugin` is a different type. |
| `createLocalClient` | `createRouterClient` |
| `asResult` | `safe` |
| `FetchLink` / `PortLink` / `WsLink` / `StdioLink` | `RPCLink` |
| `bind` | `upgrade` |
| `stream()` | `eventIterator` |
| `createSwr` | `createSWRUtils` / `createRouterUtils` / `swrUtils` |
| `bindClient` | `bind` as a client wrapper / `createMvc` / `createRouterUtils`. `PortHandler.bind` is unchanged. |
| `emit` / `catalogHash` | `generate` / `compile` as the only names; `digest` as the only hash name |
| `ts-pf-codegen` | `pf` |
| generated `Contract` | `AppRouter` |

Implemented routers in examples: `app`, not `router` (that name is the contract helper).

## v1 locks

- Contract-first only. No server-first builder whose output is inferred from the handler.
- One procedure model. Pipes are adapters. Fetch is not privileged inside `@ts-pf/server` or `@ts-pf/client`.
- Spec: `packages/protocol/PROTOCOL.md`. Envelope is `{ input }`, `{ ok: true, output }`, `{ ok: false, error: { code, message, data? } }`. Optional `multipart/form-data` (`@ts-pf/file`), `application/jsonl` (`@ts-pf/stream`), `text/event-stream` (`@ts-pf/sse`) wrap the same envelopes over HTTP. Optional message transports wrap the same envelopes over WebSocket, stdio, and MessagePort.
- Server runtime: `runProcedure` / `lookupProcedure`. `FetchHandler` is Fetch `Request` / `Response` only, in `@ts-pf/server-http`. Message adapters live in `@ts-pf/message-server`.
- `.output()` is optional (`unknown` if omitted). `.input()` once; no stacked merge/pipe.
- `.use()` runs **before** input validation (`input: unknown`). `.useAfter()` runs **after** (typed input).
- Client-side input validation is off by default.
- Unary output schema failure is `INTERNAL` with no `issues` (input failure stays `VALIDATION`). Invalid declared error `data` is the same `INTERNAL`. HTTP status for those codes is mapped by `httpStatus()` in `@ts-pf/http` (500 / 422), not stamped by `runProcedure`.
- Discriminator is JSON `error.code`. HTTP status is transport-only; never put `status`, `cause`, or `local` in the envelope.
- `PFError.status` is a TS hint (default 400), not identity. `ErrorDef.status` is optional HTTP / OpenAPI metadata.
- Local failures: `localFailure()` → `INTERNAL` with `local: true` and `status: 0`. `isLocalFailure` is `local === true`. That status is not on the wire and is not a protocol status. Abort message is `Request aborted`.
- Keep `ProtocolErrorCode` duplicated as a private union in `packages/contract/src/infer.ts`. Do not import `@ts-pf/protocol` from contract.
- `METHOD_NOT_ALLOWED` stays in the closed set; only FetchHandler emits it. `PAYLOAD_TOO_LARGE` is shared (HTTP body cap + message outbound oversize).

**Not in core:** OpenAPI runtime / REST / Scalar, error-catalog RPC, Node `IncomingMessage` adapters, framework adapters, TanStack Query, lazy routers, Map/Set on the wire, EventSource clients, Last-Event-ID, EventPublisher. File/Blob is `@ts-pf/file`. Message streams are `@ts-pf/stream`. SSE output framing is `@ts-pf/sse`. Procedure catalogs are `@ts-pf/docs`. OpenAPI 3.1 documents are `@ts-pf/openapi`. Typed-client `.d.ts` codegen is `@ts-pf/codegen`. Message transports are `@ts-pf/message` / `message-server` / `message-client`. SWR is `@ts-pf/swr`. mvc-kit Resource helpers are `@ts-pf/mvc-kit`. Fetch is `@ts-pf/server-http` / `@ts-pf/client-http`. Do not add `.docs()` to the contract builder. None of these are core defaults. Do not redeclare `VALIDATION`, `INTERNAL`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, or `PAYLOAD_TOO_LARGE` on `.errors()`.

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

`RpcCodec` encode returns `{ contentType, body }` (`string | Blob | FormData | ReadableStream<Uint8Array> | null`). Decode takes `RpcBodySource` (`contentType`, `text()`, `formData()`, `body()`). `JSONCodec` still emits `application/json` and the JSON envelope. `MultipartCodec`, `StreamCodec`, and `SseCodec` wrap it without changing contracts.

`CallOptions` is `{ signal?: AbortSignal }` on `ProcedureClient`. Do not add an oRPC-style ClientContext bag. `createClient` / `createLocalClient` forward it; `FetchLink` sets `RequestInit.signal`; `FetchHandler` passes `request.signal` into `runProcedure` → `HandlerFn` only (not middleware). Typed `ProcedureBuilder.handler` opts include `signal?: AbortSignal`. `FetchLink` sets `duplex: 'half'` when `encoded.body instanceof ReadableStream`. Streamed `ReadableStream` responses also get `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`. `FetchLink` binds `opts.fetch ?? globalThis.fetch` to `globalThis`. Fetch/interceptor catch: rethrow an existing `PFError`; abort/network → `localFailure(...)`. `decodeResponse` catch: rethrow a codec `PFError` only when `x-ts-pf-protocol` is present; no protocol header → `INTERNAL` + HTTP status + `Non-RPC response (HTTP …)` + `cause` (`isLocalFailure` is false). Fetch interceptors see raw fetch throws / `Response`s, not mapped `PFError`; `isLocalFailure` is after the call. Client call interceptors wrap `Link.call` (`path` / `input` / `signal`; `next` may replace `input`/`signal`, not `path`). Server call interceptors wrap `runProcedure` (`procedure` / `path` / `input` / `context` / `signal`; `next` may replace `input`/`context`/`signal`; `context` replaces, does not merge). Empty plugin/interceptor lists are identity (server: a length check on `runProcedure`). Do not add retry to `FetchLink`. Retry/dedupe/cache are `CallPlugin`s wrapping `Link.call` (`RetryPlugin`, `DedupePlugin`, `CachePlugin`). Server in-flight dedupe is `@ts-pf/server` `DedupePlugin`. Fetch `Interceptor`s still must not use `isLocalFailure`. `RetryPlugin` may; it is a call interceptor.

## Code

- ESM-only, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- One job per file. No HTTP in `contract`. No schemas in `protocol`. No `Request`/`Response` in `server` or `client`.
- Tests: Vitest. Type tests: `expectTypeOf` plus `tsc --noEmit`.
- Workspace: npm + Turborepo (`packages/*`, `examples/*`). Internal `@ts-pf/*` deps: `"*"` until `changeset version` rewrites them for npm; do not restore `"*"` after a bump. New published packages: `license: "MIT"`, `publishConfig.access: "public"`, `files: ["dist", "skills"]`, a `keywords` array (shared `ts-pf` / `typescript` / `rpc` / `typesafe` / `typed-rpc` / `api` / `contract-first` plus package-specific terms), a `skills/ts-pf-<pkg>/SKILL.md` consumer skill (same PR as the package), and (while pre mode is on) `.changeset/pre.json` `initialVersions`. Lockfile: `package-lock.json`. Build: `tsc -p tsconfig.build.json`.
- Consumer skills live in `packages/<pkg>/skills/ts-pf-<pkg>/SKILL.md` (hub `ts-pf-app` is in `contract`). Update the matching skill in the same PR as a public API / name / happy-path change. Do not copy this file into them. Downstream install: `npx skills experimental_sync -y`. No library `postinstall`.
- Releases: Changesets **pre mode** `beta` (`0.1.0-beta.N`, npm dist-tag `beta`). PRs that change a published `packages/*` package include a `.changeset/*.md`. First public beta is **minor**; later betas on `0.1.0` stay **patch** unless breaking. Do not `changeset pre exit` until stable `0.1.0`. Examples are private and listed in `.changeset/config.json` `ignore` (add new example names there).

## Anti-patterns

- Do not invent `TransportHandler`. `FetchHandler` stays Fetch-only. `PortHandler.bind(port)` stays a different shape.
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
- Do not re-export `createPortDuplex` / `createWsDuplex` / `createStdioDuplex` from `@ts-pf/message-server` or `@ts-pf/message-client`.
- Do not add a published Node HTTP upgrade helper or `child_process.spawn` adapter; user owns listen/upgrade/spawn/Worker bootstrap.
- Do not serve REST or OpenAPI from `FetchHandler`. Do not add GET/PUT/path params to `@ts-pf/openapi` documents. Scalar/Swagger stay userland.
- Do not serve `catalog.json` from `FetchHandler`. No `createClientFromCatalog` in v1.
- Do not reconstruct HTTP status from `error.code` on message transports.

## Examples

Live in `examples/`: `hello` (Fetch), `message` (MessagePort), `stream` (`StreamCodec`), `plugins` (`CallPlugin` / `CallInterceptor`). They are private workspace packages, not published. New examples: `private: true` and append the package name to `.changeset/config.json` `ignore`.

- Implemented routers are named `app` (not `router` — that name is the contract helper).
- Example `client.ts` must not import `@ts-pf/server`.
- Do not add framework adapter packages to satisfy an example.
- Do not restore numbered `01-hello` … `15-mvc-kit` or `_shared`.

## Done means verified

```
npm run lint && npm run check:skills && npm run type-check && npm test && npm run build
```

Wire changes must update `packages/protocol/PROTOCOL.md`. Public API / name / happy-path changes must update `packages/<pkg>/skills/ts-pf-<pkg>/SKILL.md`.
