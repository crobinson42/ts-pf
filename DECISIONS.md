# Decisions

Why each lock in [`.agents/rules.md`](.agents/rules.md) exists. The rules say *what*; this file says *why*, so a future maintainer can tell a load-bearing constraint from a habit and change the former deliberately. One paragraph per decision. When a lock changes, update its paragraph in the same PR and record what replaced it. Items marked **deferred** are agreed designs waiting on a release boundary; the detail is in the protocol 1.1 proposal referenced below.

Item IDs (`D5`, `A8`, `Q4`, …) are from the 2026 maintainer review, its remediation plan, and the protocol 1.1 design spike. Those are maintainer notes, not files in this repository; the IDs are kept so the entries can be matched to them.

## Package shape

### `contract` and `protocol` are siblings; `ProtocolErrorCode` is duplicated

`@ts-pf/contract` is what a split-repo client imports to get types, and what `@ts-pf/codegen` emits against. It must stay free of anything that is not "the shape of procedures": no wire, no HTTP, no runtime error class. `@ts-pf/protocol` is the wire: `PFError`, the envelope types, `PROTOCOL_VERSION`. If `contract` imported `protocol` to share the `ProtocolErrorCode` union, every typed client would carry the wire package and the two would version together forever. The cost of the alternative is one hand-written duplicate: `ContractProtocolErrorCode` in `packages/contract/src/infer.ts` must equal `ProtocolErrorCode` in `packages/protocol/src/error.ts`. That cost is paid by a conformance test (`packages/server/tests/protocol-error-code.test.ts`) and the five-copy checklist in the internal skill, not by a dependency edge.

### `CallInterceptor` / `CallPlugin` are duplicated in `server` and `client`

The two types are structurally identical today, so sharing them is tempting. They are kept separate because the one hard rule of the DAG is that client never depends on server and server never depends on client (a browser bundle must not pull in `runProcedure`; a server must not pull in `Link`). The only shared ancestors are `contract` and `protocol`, and neither is the right home: `contract` is types-only and `protocol` is the wire. A third "core" package for two interfaces would be the start of the plugin framework the project refuses to build. Duplication keeps the edges honest and lets the two sides diverge when they need to (server `next()` can replace `context`; client `next()` cannot).

### `@ts-pf/http` is wire helpers only

`http` owns `JSONCodec`, `RpcCodec`, the protocol header, the URL path helpers, and `httpStatus`. It does not own `FetchHandler` or `FetchLink`. That split lets `server-http` and `client-http` share the codec and status table through a package that depends on neither side, and lets `file` and `stream` wrap `JSONCodec` (and `sse` wrap `StreamCodec`) without importing a handler or a link. Putting a handler in `http` would make it a server package, and `client-http` would then depend on server code.

### `toWireError` and `isAsyncIterable` live in `protocol`

`protocol` is the one leaf that every transport package shares, so it is the only place a "thrown value → `{ code, message, data? }`" mapping and an "is this a stream of items" predicate can live without duplicating them per package or adding a DAG edge. `toWireError` owns the "unknown throw becomes `INTERNAL`, no stack, no message leak" rule for HTTP, message frames, JSONL and SSE. `isAsyncIterable` has the plain `Symbol.asyncIterator` semantics; packages that must treat a `ReadableStream` as bytes compose it (`isItemStream`) at the call site. `swr` and `mvc-kit` keep a private copy because they do not depend on `protocol` by design. `message-client` depends on `protocol` (as `message-server` already did) so it can use `isPFError`, `localFailure`, and `isAsyncIterable` directly instead of duck-typing `PFError` and carrying a predicate copy; its only `ReadableStream` exclusion is the same three-line `isItemStream` composition the other wire packages use.

### `docs` keeps its `http` dependency (`A11`)

`@ts-pf/docs` imports three things from `@ts-pf/http`: `joinProcedurePath` for each procedure's `href`, `PROTOCOL_HEADER` for the catalog's `protocol.header`, and `PROTOCOL_HTTP_STATUS` for the `protocolErrors` status column. The review asked whether an `href` option could remove the edge. It cannot: the default `href` and the status table are HTTP facts that the catalog documents (the catalog is what `@ts-pf/openapi` and `@ts-pf/codegen` read, and both describe the POST JSON RPC transport), so a pluggable `href` would still need the HTTP default from somewhere and would leave the status table in place. The smaller change was chosen: no `href` option, the dependency stays, and the reason is recorded here. If a non-HTTP catalog is ever wanted, that is a new `protocol` block on the catalog, not a removal of this one.

### Fetch is an adapter; `FetchHandler` is not in `server`

The port of the server is `runProcedure` / `lookupProcedure`; the port of the client is `Link.call`. `FetchHandler` is one adapter over that port, `PortHandler` / `WsHandler` / `StdioHandler` are others. If `FetchHandler` lived in `@ts-pf/server`, Fetch would be the privileged transport and every message adapter would carry it. Keeping it in `server-http` is also what keeps `Request` / `Response` out of `server` and `client` entirely, so those packages run anywhere JavaScript runs. The same reasoning puts `FetchLink` in `client-http`, not `client`.

### One codec per handler, one per link

A `FetchHandler` takes exactly one `RpcCodec`, and the matching `FetchLink` must use the same one. Content negotiation (`Accept`, a `codecs[]` list, per-call selection) would be additive but adds a second axis to every test matrix and a class of "codec mismatch" errors that surface as confusing decode failures (review item `D13`). The default is JSON on both sides; `MultipartCodec`, `StreamCodec`, and `SseCodec` are opt-in and explicit. Negotiation is **deferred until requested** (`A10`); see the protocol items below.

### Nineteen packages, and the `sse` → `stream` merge is a v2 candidate

The package count follows from three hard rules rather than from size: the client never sees server code, codecs do not pick a side, and message peers do not leak into HTTP peers. Every proposed merge breaks one of them (`server` + `server-http` privileges Fetch; `http` + `server-http` makes the client depend on a handler; `message` + `message-server` puts `runProcedure` in the client's duplex package). The review judged the split justified and recommended shared helpers over merging. The one exception worth revisiting is `sse` into `stream`: `SseCodec` wraps `StreamCodec` and both are HTTP-only, so folding them costs no rule. That is a v2 decision because the merge would rename an install target.

### No Node `IncomingMessage` adapter, no framework adapters

`FetchHandler` speaks the Fetch `Request` / `Response` pair, which Workers, Bun, Deno, Hono, Next.js, and Astro all hand you directly. A Node `http.createServer` bridge is a few lines of userland code that `@hono/node-server` and `srvx` already maintain well. Shipping one here would commit the project to tracking Node streaming semantics (body backpressure, `duplex: 'half'`, trailers) for every release, and would make a framework-shaped adapter the "real" API. The README section "Serving FetchHandler" points at the userland bridges; `@ts-pf/astro` is the one opt-in integration, and it exists because Astro's `APIContext` and `Astro` global need a context function, not because Fetch is missing.

## Runtime behaviour

### `validation.output` defaults off; `onError` defaults to logging

Input validation is the contract's promise to the handler and runs by default. Output validation is a check on the server's own code, costs a schema walk per response, and would be paid on every call forever; it is opt-in (`validation.output: true`). When it is on and fails, the client receives `INTERNAL` with no issues, because the bug is on the server and the schema's issues would leak internals. The companion decision (`Q3`, review `D4`) is that an unknown throw and an `INTERNAL` `PFError` are logged with `console.error` when no `onError` is given. Silence by default was the earlier behaviour and meant the first production incident was invisible; tRPC and oRPC users expect a log line. Passing `onError` replaces the default logging rather than adding to it, so a real logger is never duplicated.

### Middleware does not narrow context (`Q4`, kept for now)

`$context<C>()` is the only source of the context type. `.use()` middleware runtime-merges what it passes to `next({ context })` but does not widen the type the handler sees, so `requireUser` leaves `user?: User` optional in the handler. oRPC and tRPC flow `next({ context })` output types into later middleware and the handler, and that is a real ergonomic loss here (review `D10`, "the single lock with the largest DX cost"). It is kept because the alternative changes `createImplementer`'s generics in a way that interacts with `impl.router()` completeness checks, nested slice apps sharing one `AppCtx`, and `createLocalClient`'s context argument, all of which were being re-typed in the same release (context branding, `Q7`). The decision is to land branding first, then design narrowing on top of it for v2 rather than stacking two generic changes. Until then the documented pattern is to declare optional keys on `$context` up front.

### Client `DedupePlugin` default key covers mutations (`Q2`)

`new DedupePlugin()` keys every unary call by `JSON.stringify([path, input])`, so two concurrent `create({ name })` calls coalesce into one request (review `D5`). The plugin behaves as documented; the mistake was presenting it in the README happy path without the hazard. Option (a) from the review shipped: the bare constructor is out of the happy path and every place that introduces the plugin says to pass `key` to restrict it to reads (`examples/plugins/src/read-key.ts`). Option (c), a `reads` / `idempotent` option that makes the bare constructor a type error, is planned as a minor release; option (b), requiring `key`, was rejected because it breaks existing users for a problem a type-level nudge solves. `CachePlugin` has the same default and gets the same treatment.

## Errors and status

### `isLocalFailure` is `local === true`, not `status === 0`

A local failure (network error or abort on any link) is the client's own `PFError` with `code: 'INTERNAL'` and `local: true`, built by `localFailure()`, which today also stamps `status: 0`. That `0` is a placeholder, not a protocol status: nothing on the wire carries it, a non-RPC HTTP response is *not* local and keeps its real HTTP status, and once `status` becomes optional (below) local failures will simply have none. A check on `status === 0` would therefore break on the next change, while `local === true` says exactly what happened. `toJSON()` omits `local` for the mirror-image reason: it never crosses the wire, so a server can never make a client think a failure was local.

### `status` is transport-only; `PFError.status` is optional (`Q1a`)

The discriminator is JSON `error.code`. HTTP status is derived from it by `httpStatus()` in `@ts-pf/http` and is never put in the envelope, so a message peer and an HTTP peer agree on the error without agreeing on a status table. The review found that a required `status: number` on `ClientError` lied: 404 over HTTP, a synthesized 400 over WebSocket and MessagePort, 200 mid-stream, 0 locally (`A1`). **Decided and shipped** (`Q1a`): `PFError.status` and `ClientError.status` are optional with no default; `httpStatus()` applies the 400 default at the HTTP edge; `errorFromEnvelope` and the stream/SSE codecs no longer synthesize one; `ErrorDef.status` stays as optional HTTP and OpenAPI metadata; `localFailure` keeps `status: 0` with `local: true`; `@ts-pf/mvc-kit` fills `400` before handing an error to mvc-kit, which needs a finite number. The per-transport table lives in `PROTOCOL.md` and the client skill. Switch on `code`; treat `status` as transport metadata.

### `METHOD_NOT_ALLOWED` stays in the closed set

Only `FetchHandler` emits it (a non-POST under the prefix), but it is a protocol code rather than a Fetch-only status because non-TypeScript clients switch on `error.code` and must be able to recognise it without a side table. `PAYLOAD_TOO_LARGE` is shared between the HTTP body cap and oversize message frames for the same reason. Adding a code means editing `ProtocolErrorCode`, the contract duplicate, `PROTOCOL_HTTP_STATUS`, and `PROTOCOL.md` (the docs catalog derives from the first and third; only its `VALIDATION` data branch may need a touch), which is why the set is closed and `.errors()` may not redeclare these codes.

## Message transports

### No `TransportHandler`, no `HandlerPlugin` on message transports

`FetchHandler.handle(request)` and `PortHandler.bind(port)` have different shapes on purpose. A common `TransportHandler` interface would need a lowest-common-denominator request object, and that object would be HTTP-shaped, because HTTP is where headers, methods, and bodies live. `HandlerPlugin` (`onRequest` / `onContext` / `onResponse` / `onError`) is built around `Request` / `Response` and CORS preflight; porting it to a frame-based session would mean inventing fake requests for frames. What message adapters share with `FetchHandler` is the call pipeline, so the shared surface is `CallInterceptor` on `HandlerOptions.interceptors` and `validation`, not an HTTP plugin interface. Reusing `RpcCodec` as a frame codec is refused for the same reason: frames have no content type.

### `Duplex.send` is fire-and-forget today; drain-aware `send` is the planned change

Every `Duplex` adapter's `send` returns `void`, `PushQueue` is unbounded, and `emitStream` writes as fast as the iterator yields, so a slow WebSocket or stdio consumer grows memory without bound (review `A8`). The accepted design (`A8-B1/B2` in the protocol 1.1 proposal) widens `send` to `void | Promise<void>`, lets the stdio adapter return a drain promise from `write()`, has the WebSocket adapter poll `bufferedAmount` against a `highWaterMark`, and makes `emitStream` / `pumpInput` await it. It is additive: third-party duplexes keep compiling and gain backpressure by returning a promise. It is scheduled with or before the wave that exports `Duplex`, `DuplexHandler`, and `DuplexLink`, so no third party builds against the fire-and-forget shape. HTTP JSONL and SSE are pull-based and unaffected.

### `onHello` is the context factory; `runProcedure` is not awaited in `onFrame`

Context is created once per connection in `onHello` (or per `bind()` for `context: (info) => ctx`), not per frame, because a connection is the unit of authentication for a socket and because a per-frame factory would run on every `call`, `cancel`, and stream item. `MessageSession.onFrame` must return without awaiting `runProcedure`: awaiting it would serialise calls on one connection and make a single slow procedure block every other in-flight call and every `cancel` frame.

## Protocol items deferred to a later revision

These come from the protocol 1.1 design spike (maintainer notes, see the top of this file). The governing fact is that the v1 `hello` / `hello-ok` handshake rejects unknown keys, so nothing in 1.x can advertise a capability during the handshake without breaking 1.0 peers; only `hello.meta` and HTTP headers are tolerant channels.

- **A8-B3, bounded `PushQueue` with `pause` / `resume` and a `highWaterMark` option** — deferred to a 1.x minor after A8-B1; it needs the drain-aware `send` first and has no wire change.
- **A8-A, a `credit` frame with a handshake-negotiated window** — deferred to v2 because the handshake cannot carry the negotiation in 1.x; it is the only backpressure design that bounds the *sender* rather than the adapter.
- **A9 (client side), a third `Link.call` parameter for per-call `meta`** — deferred to v2 because it is a `Link` API redesign; the server-side tolerant reader (accepting an object-typed `meta` on `call`) is a 1.x additive change and can land first.
- **A10, codec negotiation (`RpcCodec.contentTypes`, `encodeSuccess(output, { accept })`, `FetchHandler({ codecs })`, `FetchLink` sending `Accept`)** — deferred until requested; additive and header-only, but it reintroduces the mismatch class that one-codec-per-handler avoids. The `Accept` advisory paragraph in `PROTOCOL.md` lands with the A2 version-header rule.

## Process

### Changesets, `latest` only, no pre-release mode

Every published package change carries a `.changeset/*.md` so the changelog is written by the person who made the change, in the PR that made it. Publishing only to the `latest` dist-tag and refusing `changeset pre enter` keeps one release channel for a pre-1.0 library whose consumers are expected to track the newest `0.x`; a `next` channel would double the support surface for no users today.

### Trusted publishing, no `NPM_TOKEN`

Releases authenticate with GitHub OIDC through npm trusted publishers, so no long-lived publish token exists to leak. The non-obvious consequences are recorded in `.changeset/README.md` and `CONTRIBUTING.md` ("Releasing"): `registry-url` on `actions/setup-node` writes an empty `_authToken` and makes npm skip OIDC, and the release job pins the Node and npm versions the flow was verified with.

### Consumer skills ship inside each package

`packages/<pkg>/skills/ts-pf-<pkg>/SKILL.md` versions with the package it documents, so an agent that syncs skills from `node_modules` gets the docs for the version it has installed. A separate `@ts-pf/skills` package would drift from the code by at least one release, and a library `postinstall` that syncs skills into a consumer's repo is a supply-chain smell the project refuses. The hub skill on `contract` names opt-in packages the consumer has not installed, because that is the one package every consumer has.

### README and SKILL are different surfaces (`Q8`)

The README is the npm page: narrative, install line, one snippet, and (since the review) an `API` list. The skill is the agent cheat-sheet: `Do` / `API` / `Pair with` / `Don't`. They were drifting (identifiers in one and not the other, review `O8`), so `check:skills` asserts that every symbol a skill lists under `API` is named in the package README. The direction is skill → README because the skill's `API` section is the explicit export list and the README is where a human lands first.
