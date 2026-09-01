# ts-pf rules

Contract-first TypeScript RPC library (`@ts-pf/*`). oRPC-like DX is the bar; oRPC's surface area is not. Do not grow the core into a dual-protocol platform.

## Packages

```
@ts-pf/contract     @ts-pf/protocol
        \                /    \       \        \
    @ts-pf/server   @ts-pf/client  @ts-pf/file  @ts-pf/stream
                                                         \
                                                      @ts-pf/sse
```

- `contract` and `protocol` are siblings. Neither depends on the other.
- `server` and `client` each depend on both.
- **Client never depends on server. Server never depends on client.**
- `@ts-pf/file` depends on `protocol` only. `@ts-pf/stream` depends on `protocol` and `contract` (`stream()` schema). `@ts-pf/sse` depends on `stream` and `protocol`. All three are opt-in; default handler/link stay JSON.
- Routers are nested objects, not a package.

| Package | Owns |
|---|---|
| `contract` | `procedure`, `router`, schema adapters, typed errors (`ClientError` discriminated union, `InferErrorData`, `InferContractErrors`), infer types |
| `protocol` | `PFError`, JSON envelope, `RpcCodec`, path helpers. No HTTP server. No schemas. Failure JSON is `{ code, message, data? }` only (`toJSON` omits `status`). `ProtocolErrorCode` is a closed set. |
| `server` | `createImplementer`, middleware, `FetchHandler`, `createLocalClient`, `HandlerPlugin` (`CORSPlugin`, `RequestLimitPlugin`, `RequestHeadersPlugin`, `ResponseHeadersPlugin`). `ErrorFactory` is typed on `ProcedureBuilder.handler` from that procedure’s map; `MiddlewareFn.errors` stays the default/loose factory. `finalizeDeclaredError` is internal (`runProcedure` only, not exported): invalid declared `data` → `INTERNAL` 500, no payload; async iterables are wrapped so mid-stream throws get the same check. |
| `client` | `createClient`, `FetchLink`, interceptors, `asResult` / `CallResult<T, E>` (do not widen with `E | PFError`) |
| `file` | `MultipartCodec` only. Do not add `PFFile`, `file()`, or export walk helpers. Not imported by contract/server/client. |
| `stream` | `StreamCodec` + `stream()`. Root `AsyncIterable` as JSONL envelopes. Not imported by contract/server/client. |
| `sse` | `SseCodec` + `SSE_CONTENT_TYPE`. Output-only `text/event-stream` wrapping the same envelopes. Input streams stay JSONL. Not imported by contract/server/client. |

## Public names

Do not resurrect oRPC names in code, docs, or examples.

| Use | Not |
|---|---|
| `procedure` / `router` | `oc` |
| `createImplementer` / local `impl` | `implement` / `os` |
| `FetchHandler` | `RPCHandler` |
| `CORSPlugin` / `RequestLimitPlugin` / `RequestHeadersPlugin` / `ResponseHeadersPlugin` | `*HandlerPlugin` |
| `createLocalClient` | `createRouterClient` |
| `asResult` | `safe` |
| `FetchLink` | `RPCLink` |
| `stream()` | `eventIterator` |

Implemented routers in examples: `app`, not `router` (that name is the contract helper).

## v1 locks

- Contract-first only. No server-first builder whose output is inferred from the handler.
- One protocol: POST JSON RPC. Path = router keys. Spec: `packages/protocol/PROTOCOL.md`. Optional `multipart/form-data` wraps the same envelope (`@ts-pf/file`). Optional `application/jsonl` is one envelope per line (`@ts-pf/stream`). Optional `text/event-stream` is output-only framing of those same lines (`@ts-pf/sse`).
- Server runtime: Fetch `Request` / `Response` only.
- `.output()` is optional (`unknown` if omitted). `.input()` once; no stacked merge/pipe.
- `.use()` runs **before** input validation (`input: unknown`). `.useAfter()` runs **after** (typed input).
- Client-side input validation is off by default.
- Unary output schema failure is `INTERNAL` 500 with no `issues` (input failure stays `VALIDATION` 422). Invalid declared error `data` is the same `INTERNAL`.
- Discriminator is JSON `error.code`. HTTP status is transport-only; never put `status` in the envelope.
- FetchLink maps local network failures to `INTERNAL` with `status: 0`. That status is not on the wire and is not a protocol status.
- Keep `ProtocolErrorCode` duplicated as a private union in `packages/contract/src/infer.ts`. Do not import `@ts-pf/protocol` from contract.

**Not in core:** OpenAPI/REST, error-catalog RPC, Node `IncomingMessage` adapters, framework adapters, TanStack Query, lazy routers, Map/Set on the wire, EventSource clients, Last-Event-ID, EventPublisher. File/Blob is `@ts-pf/file`. Message streams are `@ts-pf/stream`. SSE output framing is `@ts-pf/sse`. None of these are core defaults. Do not redeclare `VALIDATION`, `INTERNAL`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, or `PAYLOAD_TOO_LARGE` on `.errors()`.

## Extension (hooks, not a plugin framework)

| Hook | Package |
|---|---|
| `registerSchemaAdapter` | contract |
| `.meta()` / `.$meta()` | contract |
| `.use()` / `.useAfter()` | server |
| `HandlerPlugin` | server (`CORSPlugin`, `RequestLimitPlugin`, `RequestHeadersPlugin`, `ResponseHeadersPlugin`) |
| `RpcCodec` | protocol (`JSONCodec` is the v1 impl) |
| `Link` / interceptors | client |

`RpcCodec` encode returns `{ contentType, body }` (`string | Blob | FormData | ReadableStream<Uint8Array> | null`). Decode takes `RpcBodySource` (`contentType`, `text()`, `formData()`, `body()`). `JSONCodec` still emits `application/json` and the JSON envelope. `MultipartCodec`, `StreamCodec`, and `SseCodec` wrap it without changing contracts. `SseCodec` maps output JSONL envelopes to `text/event-stream` (`event: message` / `event: error` / `event: close`). Keep `x-ts-pf-protocol: 1` until the JSON envelope actually breaks.

`CallOptions` is `{ signal?: AbortSignal }` on `ProcedureClient`. `createClient` / `createLocalClient` forward it; `FetchLink` sets `RequestInit.signal`; `FetchHandler` passes `request.signal` into `runProcedure` → `HandlerFn` only (not middleware). Typed `ProcedureBuilder.handler` opts include `signal?: AbortSignal`. `FetchLink` sets `duplex: 'half'` when `encoded.body instanceof ReadableStream`. Streamed `ReadableStream` responses also get `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`. `FetchLink` rethrows `PFError` from `decodeResponse`.

## Code

- ESM-only, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- One job per file. No HTTP in `contract`. No schemas in `protocol`.
- Tests: Vitest. Type tests: `expectTypeOf` plus `tsc --noEmit`.
- Workspace: pnpm + Turborepo. Build: `tsc -p tsconfig.build.json`.

## Done means verified

```
pnpm lint && pnpm type-check && pnpm test && pnpm build
```

Wire changes must update `packages/protocol/PROTOCOL.md`.
