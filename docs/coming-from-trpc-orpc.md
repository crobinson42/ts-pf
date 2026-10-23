# Coming from tRPC or oRPC

A name-for-name map and an honest list of what is different. ts-pf borrows the contract-first builder shape from oRPC and the typed-client feel from both; it does not try to be a drop-in replacement for either.

## Name mapping

Names in the first column are the other library's; the second column is what you write in ts-pf. Nothing in the first column exists in ts-pf, not even as an alias.

| oRPC | ts-pf |
|---|---|
| `oc` (contract builder) | `procedure` / `router` from `@ts-pf/contract` |
| `os` / `implement(contract)` | `createImplementer(contract)` (local name `impl`) |
| `os.$context<C>()` | `impl.$context<C>()` — same idea, and the only source of the context type |
| `.use(mw)` (typed context flows forward) | `.use(mw)` before validation / `.useAfter(mw)` after; context type does not narrow |
| `RPCHandler` | `FetchHandler` (`@ts-pf/server-http`); `PortHandler` / `WsHandler` / `StdioHandler` (`@ts-pf/message-server`) |
| `RPCLink` | `FetchLink` (`@ts-pf/client-http`); `PortLink` / `WsLink` / `StdioLink` (`@ts-pf/message-client`) |
| `createORPCClient` | `createClient<typeof contract>(link)` |
| `createRouterClient` | `createLocalClient(app, { context })` |
| `safe(...)` | `asResult(...)` |
| `ORPCError` | `PFError` (`@ts-pf/protocol`) |
| `eventIterator(schema)` | `stream(schema)` (`@ts-pf/stream`) |
| `CORSPlugin`, `BodyLimitPlugin` | `CORSPlugin`, `RequestLimitPlugin` (`HandlerPlugin`s on `FetchHandler`) |
| `*HandlerPlugin` / `*LinkPlugin` | `HandlerPlugin` (HTTP lifecycle) vs `CallPlugin` (call onion, both sides) |
| `upgrade` (WebSocket) | `bind` (`PortHandler.bind(port)`, `WsHandler.bind(socket)`) |
| `OpenAPIHandler`, `.route()` | none at runtime; `openapi(catalog(contract), { info })` prints a document |
| `createRouterUtils` / `createSWRUtils` | `createSwr(client)` (`@ts-pf/swr`) |
| `InferRouterInputs` / `InferRouterOutputs` | `InferContractInputs` / `InferContractOutputs` |

| tRPC | ts-pf |
|---|---|
| `initTRPC.context<C>().create()` | `createImplementer(contract).$context<C>()` |
| `t.router({...})` / `appRouter` | `router({...})` for the contract; `impl.router({...})` for the implemented `app` |
| `t.procedure.input().query()` / `.mutation()` | `procedure.input().output()` — no query / mutation split; every call is POST |
| `.subscription()` | `.output(stream(schema))` with `StreamCodec` or `SseCodec` |
| `t.middleware` / `.use()` | `impl.middleware` / `.use()` / `.useAfter()` |
| `ctx` / `createContext` | `context` / the `context` option on `handle()`, `bind()`, `createLocalClient` |
| `TRPCError` | `PFError`; declared codes via `.errors()` and `errors.CODE(data)` |
| `fetchRequestHandler` | `FetchHandler` |
| `createTRPCClient` / `createTRPCProxyClient` | `createClient<typeof contract>(link)` |
| `httpLink` / `httpBatchLink` | `FetchLink` (no batching) |
| `wsLink` | `WsLink` |
| `createCallerFactory` | `createLocalClient` |
| `mergeRouters` | nest: `router({ planet: planetContract })` / `impl.router({ planet: planetApp })` |
| `AppRouter` (exported type) | `typeof contract` (or a generated `Contract` from `@ts-pf/codegen`) |
| `inferRouterInputs` / `inferRouterOutputs` | `InferContractInputs` / `InferContractOutputs` |
| `errorFormatter` | none; the envelope is fixed (`{ code, message, data? }`) |

## What is different

- **Contract-first only.** There is no server-first builder whose types are inferred from handlers. The contract is a separate value the client imports (as a type); the server implements it and `impl.router()` fails to compile on a missing or extra procedure. If your team shares a repo and prefers to write handlers first, that is a real change of habit.
- **Five packages for the default path**, not one. `@ts-pf/contract`, `server`, `server-http`, `client`, `client-http` (plus `protocol` as a transitive dependency). The split exists so the client bundle never contains server code and so Fetch is an adapter rather than the runtime. The install line is one command; the imports are several.
- **No Node adapter.** `FetchHandler` speaks Fetch `Request` / `Response` only. On Node you bring a small userland bridge (`@hono/node-server`, `srvx`, or your framework's raw request). See the README section "Serving FetchHandler". Workers, Bun, and Deno need nothing extra; Astro uses the opt-in `@ts-pf/astro`.
- **Middleware does not narrow context.** `$context<C>()` declares every key up front, including the ones middleware will add (`user?: User`). `next({ context })` merges at runtime but the handler's type stays `C`. Both tRPC and oRPC flow the narrowed type forward; ts-pf does not yet, and [`DECISIONS.md`](../DECISIONS.md) records why.
- **Codecs pair.** Files, JSONL streams, and SSE are opt-in codecs that must be passed to both `FetchHandler` and `FetchLink`. The default is plain JSON on both sides; a mismatch is not auto-negotiated.
- **Output validation is off by default.** Input schemas run on the server; output schemas (and stream items) run only with `validation: { output: true }`. Client-side input validation is off entirely. See [Concepts](concepts.md#validation-defaults).
- **No batching, no query/mutation distinction, no REST routing.** Every procedure is one `POST {prefix}/{path}` with a `{ input }` body. OpenAPI is a generated document from `@ts-pf/openapi`, not a second handler. Dedupe, retry, and cache are `CallPlugin`s on `createClient`; the dedupe and cache default keys cover writes unless you pass `key`, and retry re-sends writes after a dropped connection unless you pass `retry`.
- **`status` is optional and transport-specific.** The error identity is `code`. `status` is the HTTP status only on a unary Fetch failure; elsewhere it is the declared `ErrorDef.status` (in-process), `0` (local failure), or `undefined`. See [Errors](errors.md#status-per-transport).
- **One closed set of protocol codes** (`BAD_REQUEST`, `VALIDATION`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`, `INTERNAL`). Application codes are declared per procedure with `.errors()`; `INTERNAL` never carries a stack or a message from the thrown error.

The surface area is deliberately smaller than either library's. The place to check whether something you rely on exists is each package's `skills/ts-pf-<pkg>/SKILL.md` (`API` section) or the hub skill `packages/contract/skills/ts-pf-app/SKILL.md`.
