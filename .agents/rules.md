# ts-pf rules

Contract-first TypeScript RPC library (`@ts-pf/*`). oRPC-like DX is the bar; oRPC's surface area is not. Do not grow the core into a dual-protocol platform.

## Packages

```
@ts-pf/contract     @ts-pf/protocol
        \                /    \       \        \              \
    @ts-pf/server   @ts-pf/client  @ts-pf/file  @ts-pf/stream  @ts-pf/message
                                                         \         /      \
                                                      @ts-pf/sse          \
                                                              @ts-pf/message-server
                                                              @ts-pf/message-client

@ts-pf/docs  (contract + protocol; not imported by core)
@ts-pf/openapi (docs; not imported by core)
@ts-pf/codegen (docs; not imported by core)
@ts-pf/swr   (contract; peer swr; not imported by core)
@ts-pf/mvc-kit (contract; peer mvc-kit >= 4.9.0; not imported by core)
```

- `contract` and `protocol` are siblings. Neither depends on the other.
- `server` and `client` each depend on both.
- **Client never depends on server. Server never depends on client.**
- `@ts-pf/file` depends on `protocol` only. `@ts-pf/stream` depends on `protocol` and `contract` (`stream()` schema). `@ts-pf/sse` depends on `stream` and `protocol`. All three are opt-in; default handler/link stay JSON.
- `@ts-pf/message` depends on `protocol` only. `@ts-pf/message-server` depends on `message` + `server` (never client, prod or dev). `@ts-pf/message-client` depends on `message` + `client` (never server in prod; one-way `message-server` **devDependency** for e2e). All three are opt-in; default handler/link stay Fetch.
- `@ts-pf/docs` depends on `contract` and `protocol`. Not imported by core. Optional; not a handler, codec, or HTTP route.
- `@ts-pf/openapi` depends on `docs`. Not imported by core. Optional; `catalog()` → OpenAPI 3.1. No HTTP, no UI, no REST.
- `@ts-pf/codegen` depends on `docs`. Not imported by core. Optional; `catalog()` → nested `Contract` `.d.ts`. No HTTP, no second client runtime.
- `@ts-pf/swr` depends on `contract` only (peer `swr`). Wraps a `ContractClient`. Not imported by core. Optional; not a React provider or hook wrapper.
- `@ts-pf/mvc-kit` depends on `contract` only (peer `mvc-kit >= 4.9.0`). Wraps a `ContractClient`. Not imported by core. Optional; not a React wrapper or Resource generator.
- Routers are nested objects, not a package.

| Package | Owns |
|---|---|
| `contract` | `procedure`, `router`, schema adapters, typed errors (`ClientError` discriminated union, `InferErrorData`, `InferContractErrors`), infer types |
| `protocol` | `PFError`, JSON envelope, `RpcCodec`, path helpers. No HTTP server. No schemas. Failure JSON is `{ code, message, data? }` only (`toJSON` omits `status` and `cause`). `ProtocolErrorCode` is a closed set. |
| `server` | `createImplementer`, middleware, `FetchHandler`, `createLocalClient`, `HandlerPlugin` (`CORSPlugin`, `RequestLimitPlugin`, `RequestHeadersPlugin`, `ResponseHeadersPlugin`). `ErrorFactory` is typed on `ProcedureBuilder.handler` from that procedure’s map; `MiddlewareFn.errors` stays the default/loose factory. `finalizeDeclaredError` is internal (`runProcedure` only, not exported): invalid declared `data` → `INTERNAL` 500, no payload; async iterables are wrapped so mid-stream throws get the same check. |
| `client` | `createClient`, `FetchLink`, interceptors, `asResult` / `CallResult<T, E>` (do not widen with `E | PFError`), `isLocalFailure` |
| `file` | `MultipartCodec` only. Do not add `PFFile`, `file()`, or export walk helpers. Not imported by contract/server/client. |
| `stream` | `StreamCodec` + `stream()`. Root `AsyncIterable` as JSONL envelopes. Not imported by contract/server/client. |
| `sse` | `SseCodec` + `SSE_CONTENT_TYPE`. Output-only `text/event-stream` wrapping the same envelopes. Input streams stay JSONL. Not imported by contract/server/client. |
| `docs` | `catalog()`, `docs()` meta helper, `walkContract`, `registerJsonSchemaConverter`. Optional. Contract-first. No OpenAPI document type, no codegen, no UI, no HTTP. |
| `openapi` | `openapi(catalog, options)` → OpenAPI 3.1. POST JSON RPC only. Optional. Do not fold into docs/server. No Scalar/Swagger, no FetchHandler route, no REST. |
| `codegen` | `emit(catalog)`, `catalogHash()`, `EmitOptions`, CLI `ts-pf-codegen`. Nested `Contract` `.d.ts` from `catalog()`. Optional. Do not fold into client/docs. No `createClientFromCatalog`, no FetchHandler route. |
| `swr` | `createSwr(client)` helpers for SWR (`key` / `fetcher` / `mutator` / `matcher` / `subscriber` / `liveSubscriber` / `call`). Optional. Do not fold into client. |
| `mvc-kit` | `bindClient(client, host)` / `issuesToFieldErrors` / `DisposeSignalHost`. Optional. Do not fold into client. Do not wrap Resource / `useLocal`. |
| `message` | JSON text frames + `MessageSession` / `Duplex` + port/ws/stdio duplex adapters. Not an HTTP codec. Not imported by contract/server/client. |
| `message-server` | `PortHandler`, `WsHandler`, `StdioHandler` (`./stdio` only), `HandlerOptions`, type `WebSocketLike`. Calls `lookupProcedure` + `runProcedure`. Never depends on client. Do not re-export duplex factories. |
| `message-client` | `PortLink`, `WsLink`, `StdioLink` (`./stdio` only), type `LinkOptions`, type `WebSocketLike`. Implements `Link`. Never depends on server (prod). Do not re-export duplex factories. |

## Public names

Do not resurrect oRPC names in code, docs, or examples.

| Use | Not |
|---|---|
| `procedure` / `router` | `oc` |
| `createImplementer` / local `impl` | `implement` / `os` |
| `FetchHandler` / `PortHandler` / `WsHandler` / `StdioHandler` | `RPCHandler` |
| `CORSPlugin` / `RequestLimitPlugin` / `RequestHeadersPlugin` / `ResponseHeadersPlugin` | `*HandlerPlugin` |
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
- One protocol: POST JSON RPC. Path = router keys. Spec: `packages/protocol/PROTOCOL.md`. Optional `multipart/form-data` wraps the same envelope (`@ts-pf/file`). Optional `application/jsonl` is one envelope per line (`@ts-pf/stream`). Optional `text/event-stream` is output-only framing of those same lines (`@ts-pf/sse`). Optional message transports (`@ts-pf/message` / `message-server` / `message-client`) wrap the same envelope over WebSocket, stdio, and MessagePort. Default handler/link stay Fetch.
- Server runtime: `FetchHandler` is Fetch `Request` / `Response` only. Opt-in message adapters (`PortHandler` / `WsHandler` / `StdioHandler`) live in `@ts-pf/message-server` and call `lookupProcedure` + `runProcedure`.
- `.output()` is optional (`unknown` if omitted). `.input()` once; no stacked merge/pipe.
- `.use()` runs **before** input validation (`input: unknown`). `.useAfter()` runs **after** (typed input).
- Client-side input validation is off by default.
- Unary output schema failure is `INTERNAL` 500 with no `issues` (input failure stays `VALIDATION` 422). Invalid declared error `data` is the same `INTERNAL`.
- Discriminator is JSON `error.code`. HTTP status is transport-only; never put `status` or `cause` in the envelope.
- FetchLink maps local network/abort failures to `INTERNAL` with `status: 0` and sets `Error.cause`. Abort message is `Request aborted`. That status is not on the wire and is not a protocol status. `isLocalFailure` is `status === 0` on `@ts-pf/client`.
- Keep `ProtocolErrorCode` duplicated as a private union in `packages/contract/src/infer.ts`. Do not import `@ts-pf/protocol` from contract.

**Not in core:** OpenAPI runtime / REST / Scalar, error-catalog RPC, Node `IncomingMessage` adapters, framework adapters, TanStack Query, lazy routers, Map/Set on the wire, EventSource clients, Last-Event-ID, EventPublisher. File/Blob is `@ts-pf/file`. Message streams are `@ts-pf/stream`. SSE output framing is `@ts-pf/sse`. Procedure catalogs are `@ts-pf/docs`. OpenAPI 3.1 documents are `@ts-pf/openapi` (`catalog()` projection; POST JSON RPC; not a handler). Typed-client `.d.ts` codegen is `@ts-pf/codegen` (`catalog()` projection; not a handler; still no catalog RPC, no FetchHandler GET). Message transports are `@ts-pf/message` / `message-server` / `message-client`. SWR is `@ts-pf/swr`. mvc-kit Resource helpers are `@ts-pf/mvc-kit`. Do not add `.docs()` to the contract builder. None of these are core defaults. Do not redeclare `VALIDATION`, `INTERNAL`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, or `PAYLOAD_TOO_LARGE` on `.errors()`.

## Extension (hooks, not a plugin framework)

| Hook | Package |
|---|---|
| `registerSchemaAdapter` | contract |
| `.meta()` / `.$meta()` | contract |
| `.use()` / `.useAfter()` | server |
| `HandlerPlugin` | server (`CORSPlugin`, `RequestLimitPlugin`, `RequestHeadersPlugin`, `ResponseHeadersPlugin`) |
| `RpcCodec` | protocol (`JSONCodec` is the v1 impl) |
| `Link` / interceptors | client |
| `docs()` / `catalog()` / `registerJsonSchemaConverter` | docs |
| `openapi()` | openapi |
| `emit` / `catalogHash` | codegen |
| `createSwr` | swr |
| `bindClient` | mvc-kit |

`RpcCodec` encode returns `{ contentType, body }` (`string | Blob | FormData | ReadableStream<Uint8Array> | null`). Decode takes `RpcBodySource` (`contentType`, `text()`, `formData()`, `body()`). `JSONCodec` still emits `application/json` and the JSON envelope. `MultipartCodec`, `StreamCodec`, and `SseCodec` wrap it without changing contracts. `SseCodec` maps output JSONL envelopes to `text/event-stream` (`event: message` / `event: error` / `event: close`). Keep `x-ts-pf-protocol: 1` until the JSON envelope actually breaks.

`CallOptions` is `{ signal?: AbortSignal }` on `ProcedureClient`. `createClient` / `createLocalClient` forward it; `FetchLink` sets `RequestInit.signal`; `FetchHandler` passes `request.signal` into `runProcedure` → `HandlerFn` only (not middleware). Typed `ProcedureBuilder.handler` opts include `signal?: AbortSignal`. `FetchLink` sets `duplex: 'half'` when `encoded.body instanceof ReadableStream`. Streamed `ReadableStream` responses also get `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`. `FetchLink` binds `opts.fetch ?? globalThis.fetch` to `globalThis` so browser `window.fetch` is not called with `FetchLink` as `this`. Fetch/interceptor catch: rethrow an existing `PFError`; abort → `INTERNAL` status 0, message `Request aborted`, plus `cause`; other throws → `INTERNAL` status 0, original message (non-`Error` → `Network error`), plus `cause`. `decodeResponse` catch: rethrow a codec `PFError` only when `x-ts-pf-protocol` is present; no protocol header → `INTERNAL` + HTTP status + `Non-RPC response (HTTP …)` + `cause` (`isLocalFailure` is false). Protocol response + non-`PFError` decode throw → `INTERNAL` + HTTP status + `Invalid response` + `cause`. Interceptors see raw fetch throws / `Response`s, not mapped `PFError`; `isLocalFailure` is after the call. Retry stays in `examples/04-plugins` (clone `Request` before the first `next()`; never retry abort). Do not add retry to `FetchLink`.

## Code

- ESM-only, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- One job per file. No HTTP in `contract`. No schemas in `protocol`.
- Tests: Vitest. Type tests: `expectTypeOf` plus `tsc --noEmit`.
- Workspace: pnpm + Turborepo. Build: `tsc -p tsconfig.build.json`.

## Anti-patterns

- Do not invent `TransportHandler`. `FetchHandler` stays Fetch-only.
- Do not port `HandlerPlugin` onto WS / stdio / MessagePort.
- Do not reuse `RpcCodec` as a message framer. Reuse envelope types only.
- Do not put `.ws()` / `.stdio()` / `.port()` on procedures.
- Do not depend on the `ws` npm package. Inject a `WebSocket` constructor.
- `@ts-pf/message-server` never depends on `@ts-pf/client` (prod or dev).
- `@ts-pf/message-client` never depends on `@ts-pf/server` (prod).
- Do not import `@ts-pf/message-server` from `@ts-pf/server`; do not import `@ts-pf/message-client` from `@ts-pf/client` (prod).
- Do not `await runProcedure` inside `MessageSession` (`onFrame` must return without awaiting it).
- Context factory is `onHello`, not `onFrame`.
- Do not rewrite oversize payloads in `session.send`.
- Do not re-export `createPortDuplex` / `createWsDuplex` / `createStdioDuplex` from `@ts-pf/message-server` or `@ts-pf/message-client`.
- Do not add a published Node HTTP upgrade helper or `child_process.spawn` adapter; user owns listen/upgrade/spawn/Worker bootstrap. Do not turn `examples/_shared` into a published WS listen API.
- Do not serve REST or OpenAPI from `FetchHandler`. Do not add GET/PUT/path params to `@ts-pf/openapi` documents. Scalar/Swagger stay userland.
- Do not serve `catalog.json` from `FetchHandler`. Do not emit `.d.ts` of the live router, `FromSchema` over JSON, or OpenAPI-TS as the first-party typed client. Codegen stays in `@ts-pf/codegen`.

## Examples

Live in `examples/`, numbered `01-hello` … `08-workshop`, `10-docs`, `11-message`, `12-swr`, `13-openapi`, `14-codegen`, and `15-mvc-kit`. They are private workspace packages, not published.

- Implemented routers are named `app` (not `router` — that name is the contract helper).
- Example `client.ts` / workshop `web` must not import `@ts-pf/server`.
- Do not add framework adapter packages to satisfy an example.
- Shared Node glue is `examples/_shared` (`ts-pf-example-shared`). It is private, not a published HTTP adapter. The library surface remains `FetchHandler` + `FetchLink`. Opt-in message transports are `PortHandler` / `PortLink` (and WS / stdio) in other packages.

## Done means verified

```
pnpm lint && pnpm type-check && pnpm test && pnpm build
```

Wire changes must update `packages/protocol/PROTOCOL.md`.
