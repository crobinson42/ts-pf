# @ts-pf/server-http

## 0.5.1

### Patch Changes

- Updated dependencies [[`6fca318`](https://github.com/crobinson42/ts-pf/commit/6fca3182b414f0223dd7d58b2d8f97f048692ce2)]:
  - @ts-pf/protocol@0.5.1
  - @ts-pf/http@0.5.1
  - @ts-pf/server@0.5.1

## 0.5.0

### Patch Changes

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798) Thanks [@crobinson42](https://github.com/crobinson42)! - Every published `@ts-pf/*` package now releases together on one version (a Changesets `fixed` group), starting with this release; that is why this package's version jumps. Keep all `@ts-pf/*` dependencies on the same version and update them together in one install command: internal dependencies are exact pins, so a mixed set installs duplicate copies of shared packages such as `@ts-pf/protocol`.

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`09140cd`](https://github.com/crobinson42/ts-pf/commit/09140cd8c927d04953479f9f56f3449b3a30459c) Thanks [@crobinson42](https://github.com/crobinson42)! - Server and catalog DX improvements.
  
  - `@ts-pf/server`: add `mapStreamErrors(value, fn)`. Wraps an async iterable so a throw during iteration is replaced by `fn(error)`, and returns any other value unchanged, so one `.use()` middleware can map domain errors to declared codes for unary and stream procedures alike (`return mapStreamErrors(await next(), mapError)`). Mapped errors still get the declared-error `data` check. The README and skill also document that middleware `next()` must be called at most once (use a `CallInterceptor` for retries), that the handler `signal` may be absent for in-process callers, and an auth-middleware-plus-narrowing-helper pattern for context keys middleware adds.
  - `@ts-pf/docs`: `docs('…')` is shorthand for `docs({ description: '…' })`. `catalog(contract, { requireDescription: true })` throws an error listing every catalog procedure without a `docs()` description or summary (default `false`).
  - `@ts-pf/server-http`: document that a `HandlerPlugin.onRequest` that throws a `PFError` is answered through the normal error path, e.g. `NOT_FOUND` for a procedure that should not be served over HTTP.
  - `@ts-pf/message-client`: the skill notes that a drain stall is always `INTERNAL` with a fixed message, distinct from app-defined error codes.
  - `@ts-pf/contract`: the hub skill shows the `docs('…')` shorthand.

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`675edb7`](https://github.com/crobinson42/ts-pf/commit/675edb75df8e400dfc70474b60989b59ff464375) Thanks [@crobinson42](https://github.com/crobinson42)! - A stream procedure served through a codec that cannot carry streams no longer answers `200 {"ok":true,"output":{}}` and leaves its iterator open. `RpcCodec` gains an optional `streams` flag (`false` on `JSONCodec` and `MultipartCodec`, `true` on `StreamCodec` and `SseCodec`; custom codecs should set it). When it is `false`, `FetchHandler` answers a procedure whose contract input or output is `stream()` with `400 BAD_REQUEST` `Stream procedure requires a streaming codec` before the body is read and before context, middleware, or the handler run. A handler that returns an `AsyncIterable` the codec did not encode as a stream gets the same answer, and its iterator is closed. `PROTOCOL.md` documents the response.

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`e32afd5`](https://github.com/crobinson42/ts-pf/commit/e32afd5c369fea7e9e3b2a7b772546ab134df26c) Thanks [@crobinson42](https://github.com/crobinson42)! - Add `isUnexpectedError(error)` to `@ts-pf/protocol`: `true` for any value that is not a `PFError` and for a `PFError` whose code is `INTERNAL`. It is the filter `FetchHandler` and `@ts-pf/mcp` use for their default `console.error` logging (now implemented with it; behaviour unchanged), so a custom `onError` can keep the same filter: `onError: (e) => { if (isUnexpectedError(e)) logger.error(e) }`.
- Updated dependencies [[`e81b871`](https://github.com/crobinson42/ts-pf/commit/e81b87125b359d488734273603bb313bdf00624a), [`d47d657`](https://github.com/crobinson42/ts-pf/commit/d47d65766943cbbc02411f27961e8da3f93d33a9), [`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798), [`26d42ca`](https://github.com/crobinson42/ts-pf/commit/26d42ca895f73451d81f6198f659acf8fcb0e7ee), [`a603b5c`](https://github.com/crobinson42/ts-pf/commit/a603b5cfec1d52d385d5fa7eab098d9415cb90dd), [`d772f61`](https://github.com/crobinson42/ts-pf/commit/d772f61b4c8c27b134c3f7185498bb94964d8b3e), [`09140cd`](https://github.com/crobinson42/ts-pf/commit/09140cd8c927d04953479f9f56f3449b3a30459c), [`675edb7`](https://github.com/crobinson42/ts-pf/commit/675edb75df8e400dfc70474b60989b59ff464375), [`e32afd5`](https://github.com/crobinson42/ts-pf/commit/e32afd5c369fea7e9e3b2a7b772546ab134df26c), [`7de78ce`](https://github.com/crobinson42/ts-pf/commit/7de78ce883a8e24801934ef7853f32850d0644ec)]:
  - @ts-pf/server@0.5.0
  - @ts-pf/http@0.5.0
  - @ts-pf/protocol@0.5.0

## 0.3.5

### Patch Changes

- Updated dependencies []:
  - @ts-pf/server@0.4.4

## 0.3.4

### Patch Changes

- [#32](https://github.com/crobinson42/ts-pf/pull/32) [`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only, no API or wire change. The `ts-pf-server-http` skill gains "Cacheable reads and public REST (userland)": a smoke-tested GET bridge (`HandlerPlugin` + Fetch `Interceptor`, in `examples/plugins`) that serves opted-in reads as `GET {prefix}/{path}?input=<JSON>` with `Cache-Control`, plus a REST facade over `createLocalClient`. The `ts-pf-openapi` skill shows how to add the bridge's `get` operations to the generated document; `ts-pf-client-http`, `ts-pf-docs`, and the `ts-pf-app` hub point at it; `PROTOCOL.md` notes that such a bridge sits outside the v1 wire.
- Updated dependencies [[`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3)]:
  - @ts-pf/protocol@0.2.2
  - @ts-pf/server@0.4.3
  - @ts-pf/http@0.2.2

## 0.3.3

### Patch Changes

- [#29](https://github.com/crobinson42/ts-pf/pull/29) [`692515f`](https://github.com/crobinson42/ts-pf/commit/692515ff3e5179aca8df903cbc5e2eaae693a454) Thanks [@crobinson42](https://github.com/crobinson42)! - `RequestLimitPlugin` builds its wrapped request from the URL plus `method`, `headers`, and `signal` instead of `new Request(request, init)`, so it works behind srvx on Node, whose request passes `instanceof Request` but cannot be cloned by undici (every call with a body answered `500 INTERNAL` with `Cannot read private member #state`). No srvx `patchGlobalRequest()` (`srvx/node`) is needed.

## 0.3.2

### Patch Changes

- [#24](https://github.com/crobinson42/ts-pf/pull/24) [`491a8c1`](https://github.com/crobinson42/ts-pf/commit/491a8c1146309caf305c8bc62c874e3a7aba3a05) Thanks [@crobinson42](https://github.com/crobinson42)! - Internal hot-path optimization, no behaviour change.

- [#26](https://github.com/crobinson42/ts-pf/pull/26) [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01) Thanks [@crobinson42](https://github.com/crobinson42)! - Quote consumer skill `description` front matter so `npx skills experimental_sync` can install the skills. An unquoted `Triggers:` is invalid YAML, and the installer skipped every published skill.
- Updated dependencies [[`491a8c1`](https://github.com/crobinson42/ts-pf/commit/491a8c1146309caf305c8bc62c874e3a7aba3a05), [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01)]:
  - @ts-pf/server@0.4.2
  - @ts-pf/http@0.2.1
  - @ts-pf/protocol@0.2.1

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @ts-pf/server@0.4.1

## 0.3.0

### Minor Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`3c61912`](https://github.com/crobinson42/ts-pf/commit/3c6191249ca1c7480af807f5559cfbb4bb9979b6) Thanks [@crobinson42](https://github.com/crobinson42)! - `new FetchHandler(app)` infers `TCtx` from the app's context brand (the `$context<C>()` type behind `impl.router()`), so `handle(request, { context })` is checked against it and a `context` factory gets `req: Request` without an annotation: `context: (req) => ({ db, req })` compiles with no implicit `any`. An explicit `new FetchHandler<AppCtx>(app)` is still accepted when `AppCtx` satisfies the app's context. A tree not produced by `impl.router()` infers `TCtx = unknown` (only the router-level brand is read); an implementer that never called `$context()` brands `object`, so a non-object `context` is rejected.

  Previously compiling code that can stop compiling, intended: `handle(request, { context })` with a value or factory result that does not satisfy `$context<C>()` (for example `{ wrong: 1 }`, or a missing required key), and an explicit generic narrower than the app's context (`new FetchHandler<{ db: Db }>(app)` when the app needs `{ db, req }`).

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`6e78e6e`](https://github.com/crobinson42/ts-pf/commit/6e78e6e3228a093edd2d93795ca0d7563d4acec9) Thanks [@crobinson42](https://github.com/crobinson42)! - `FetchHandler` gains an `onError(error, { request, path, context })` option. It is a side-effect hook called for every error response with the original thrown value (before unknown throws are mapped to `INTERNAL`), runs after each `HandlerPlugin.onError`, and cannot replace the response.

  Behavior change: when `onError` is not set, `FetchHandler` now logs with `console.error` instead of staying silent — unknown (non-`PFError`) throws, and `INTERNAL` `PFError`s (output schema failure under `validation.output`, invalid declared error `data`, or an explicit `INTERNAL` throw). Declared and other protocol errors are not logged. Passing `onError` disables the default logging. Errors thrown after a streamed response has started are written in-band by the codec as `INTERNAL` items and do not reach `onError` or the default log. The callback type is exported as `FetchHandlerOnError`.

  A JSON envelope object with keys but no `input` key (for example `{"id":1}` instead of `{"input":{"id":1}}`) is now `400 BAD_REQUEST` with message `Request body must be {"input": ...}` instead of a confusing `422 VALIDATION` on an undefined input. The check lives in `@ts-pf/http` `JSONCodec`, so it also covers the multipart `rpc` part and JSONL input lines. `{}` and `{"input":null}` still decode to an undefined input.

  `METHOD_NOT_ALLOWED` now flows through the same error path, so `HandlerPlugin.onError` and `onError` also see 405s.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`fb03a52`](https://github.com/crobinson42/ts-pf/commit/fb03a52ac4e8d520cd6b30c24331af8069de9cd5) Thanks [@crobinson42](https://github.com/crobinson42)! - `FetchHandler` now reads the request `x-ts-pf-protocol` header. A missing header is accepted as before (curl, non-ts-pf clients). A header equal to `1` (surrounding whitespace ignored) is accepted. Any other value (`2`, `1.0`, an empty string, …) answers `400 BAD_REQUEST` with message `Unsupported protocol version` — the same code and string the message handshake uses — without reading the body. The check runs after the method check and before the procedure lookup, so a non-POST is still `405` whatever the header says, and the error reaches `HandlerPlugin.onError` and the `onError` option like every other pre-call failure. The response still carries `x-ts-pf-protocol: 1`.

  Behavior change: a client that sends a malformed `x-ts-pf-protocol` value (for example `1.0`) was previously served as v1 and is now rejected with 400. No shipped ts-pf client sends such a value; `FetchLink` sends exactly `1`.

### Patch Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only. READMEs that did not name every symbol in their skill's `## API` section gain a matching `API` list (`check:skills` now asserts it), and every fenced `ts` block in READMEs and skills now type-checks against `dist` (`check:snippets`): missing `procedure` / `z` / `catalog` / `spawn` / `FetchHandler` imports were added, Node-resolved relative imports carry `.js`, the server skill implements the whole example contract, and prose fragments are marked `no-check`.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb) Thanks [@crobinson42](https://github.com/crobinson42)! - Declare `engines.node >=22` and ship the MIT `LICENSE` file in the tarball.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`4eb1dcc`](https://github.com/crobinson42/ts-pf/commit/4eb1dcc0fc4ec3ec8d843e953be5b60330bc10db) Thanks [@crobinson42](https://github.com/crobinson42)! - Internal: `FetchHandler.handle()` is split into named private steps that mirror the call pipeline (`onRequest` plugins, method check, lookup, decode, context + `onContext`, run, encode, error reporting, `onResponse`). No behaviour change: `METHOD_NOT_ALLOWED` still throws inside the pipeline so plugins and `onError` see it, and the `onError` / default-logging rules are unchanged.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`821acc1`](https://github.com/crobinson42/ts-pf/commit/821acc1638700dc90e83ec93dfba909cb234e8b4) Thanks [@crobinson42](https://github.com/crobinson42)! - `FetchHandler` now looks the procedure up before decoding the request body (order: `onRequest` plugins → method check → lookup → decode → context → run). An unknown path under the prefix answers `404 NOT_FOUND` without buffering or parsing the body, so an unknown path with an invalid JSON body is now `404 NOT_FOUND` instead of `400 BAD_REQUEST`, and an unknown path with a streamed body over `RequestLimitPlugin`'s `maxBodySize` (no `Content-Length`) is now `404` instead of `413` because the stream is never read. `RequestLimitPlugin`'s `Content-Length` check still runs first in `onRequest`, so a declared oversize body stays `413 PAYLOAD_TOO_LARGE` on any path. A known path with an invalid body is still `400`, a non-POST is still `405` on any path, and `HandlerPlugin.onError` / `onError` / the default log see the 404 exactly as before.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`025c1c4`](https://github.com/crobinson42/ts-pf/commit/025c1c47ca5ec7484e2c3d388278c5fe8380c6e6) Thanks [@crobinson42](https://github.com/crobinson42)! - Internal refactor, no behaviour change: the "unknown throw becomes `INTERNAL`" mapping and the "is this a stream" predicate now come from `@ts-pf/protocol` (`toWireError`, `isAsyncIterable`) instead of a private copy in each package.

  - `@ts-pf/server-http` (`FetchHandler` error response), `@ts-pf/message-server` (`result` frames), `@ts-pf/stream` and `@ts-pf/sse` (in-band failure lines) encode failures with `toWireError`. The bytes on the wire are identical: `PFError` → `{ code, message, data? }`, anything else → `{ code: 'INTERNAL', message: 'Internal server error' }`. `onError` hooks and the default log still receive the original thrown value; HTTP status still comes from `httpStatus()`.
  - `@ts-pf/client` (`RetryPlugin`, `DedupePlugin`, `CachePlugin`) and `@ts-pf/server` (`DedupePlugin`, the `runProcedure` output wrap) use protocol `isAsyncIterable`. `@ts-pf/stream`, `@ts-pf/sse`, and `@ts-pf/message-server` compose it with the same `ReadableStream` exclusion they had before (a local `isItemStream`), so a `ReadableStream` is still a plain value, not a stream of items. `@ts-pf/swr` does not depend on `@ts-pf/protocol` and keeps a local copy (comment only). `@ts-pf/message-client` now depends on `@ts-pf/protocol` and composes the same `isItemStream` (see its own entry).

- Updated dependencies [[`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5), [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb), [`053fd11`](https://github.com/crobinson42/ts-pf/commit/053fd11533e4897a3e63a81478cbc7b89182fdd2), [`5fde308`](https://github.com/crobinson42/ts-pf/commit/5fde308064b37da76e3faaf688a0d4a734d1240d), [`5e5a998`](https://github.com/crobinson42/ts-pf/commit/5e5a99848231e36d8bfa1ef57db9169aee6d9750), [`fb03a52`](https://github.com/crobinson42/ts-pf/commit/fb03a52ac4e8d520cd6b30c24331af8069de9cd5), [`025c1c4`](https://github.com/crobinson42/ts-pf/commit/025c1c47ca5ec7484e2c3d388278c5fe8380c6e6), [`53aaa5a`](https://github.com/crobinson42/ts-pf/commit/53aaa5a33ffee876b237ef6a85744c99cd4aa7d1), [`e7ccbb5`](https://github.com/crobinson42/ts-pf/commit/e7ccbb55b4431a10e8bd301cafc9eb21ff54984c), [`1505305`](https://github.com/crobinson42/ts-pf/commit/1505305f3d5df3547f5746243aa710f6a6d835c7), [`d3498b5`](https://github.com/crobinson42/ts-pf/commit/d3498b57ed2d48b159b80f3c952e33a5824af77c), [`3268bc4`](https://github.com/crobinson42/ts-pf/commit/3268bc4b3cb5b94ceb8e8cb6473b0d7785911b8d), [`025c1c4`](https://github.com/crobinson42/ts-pf/commit/025c1c47ca5ec7484e2c3d388278c5fe8380c6e6)]:
  - @ts-pf/http@0.2.0
  - @ts-pf/protocol@0.2.0
  - @ts-pf/server@0.4.0

## 0.2.1

### Patch Changes

- @ts-pf/server@0.3.1

## 0.2.0

### Minor Changes

- 8cf3711: Output schema checks, including stream output items, run only when `validation.output` is true. Input checks stay on unless `validation.input` is false. Parsed output (strip, defaults, transforms) is applied only when output checks are on.

### Patch Changes

- Updated dependencies [8cf3711]
  - @ts-pf/server@0.3.0
  - @ts-pf/protocol@0.1.2
  - @ts-pf/http@0.1.2

## 0.1.3

### Patch Changes

- @ts-pf/server@0.2.2

## 0.1.2

### Patch Changes

- 92c5262: Point package `exports` at `dist`. npm does not rewrite `publishConfig.exports`, so published tarballs previously resolved to missing `src/` files.
- Updated dependencies [92c5262]
  - @ts-pf/http@0.1.1
  - @ts-pf/protocol@0.1.1
  - @ts-pf/server@0.2.1

## 0.1.1

### Patch Changes

- Updated dependencies [1070bfa]
  - @ts-pf/server@0.2.0

## 0.1.0

### Patch Changes

- First stable `0.1.0` release. Exit Changesets pre mode and publish to the npm `latest` dist-tag.
- Updated dependencies
  - @ts-pf/http@0.1.0
  - @ts-pf/protocol@0.1.0
  - @ts-pf/server@0.1.0

## 0.1.0-beta.2

### Patch Changes

- e85f033: Add npm `keywords` on every published package so the family is discoverable (typescript, rpc, typesafe, contract-first) with per-package terms for the pipe or adapter.
- Updated dependencies [e85f033]
  - @ts-pf/http@0.1.0-beta.2
  - @ts-pf/protocol@0.1.0-beta.2
  - @ts-pf/server@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- Publish from GitHub Actions with npm trusted publishing (OIDC). No `NPM_TOKEN`.
- Updated dependencies
  - @ts-pf/http@0.1.0-beta.1
  - @ts-pf/protocol@0.1.0-beta.1
  - @ts-pf/server@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 5ffff32: First public beta of the `@ts-pf` packages. Contract-first TypeScript RPC: one procedure model, Fetch and message adapters, and opt-in file, stream, SSE, docs, OpenAPI, codegen, SWR, and mvc-kit packages.

### Patch Changes

- 5ffff32: Ship a consumer agent skill with each package (`skills/ts-pf-<name>/SKILL.md`, plus hub `ts-pf-app` on `@ts-pf/contract`). After install or `npm update`: `npx skills experimental_sync -y`. Skills version with the package. Do not put this on a library `postinstall`.
- Updated dependencies [5ffff32]
- Updated dependencies [5ffff32]
  - @ts-pf/http@0.1.0-beta.0
  - @ts-pf/protocol@0.1.0-beta.0
  - @ts-pf/server@0.1.0-beta.0
