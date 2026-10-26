# @ts-pf/server

## 0.4.3

### Patch Changes

- Updated dependencies [[`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3)]:
  - @ts-pf/contract@0.2.3
  - @ts-pf/protocol@0.2.2

## 0.4.2

### Patch Changes

- [#24](https://github.com/crobinson42/ts-pf/pull/24) [`491a8c1`](https://github.com/crobinson42/ts-pf/commit/491a8c1146309caf305c8bc62c874e3a7aba3a05) Thanks [@crobinson42](https://github.com/crobinson42)! - Faster calls: the procedure runtime allocates less per call, and the `errors` factory is built once per error map and shared. Visible effect: that shared `errors` object is frozen, so assigning to it from a handler or middleware now throws instead of leaking into other calls.

- [#26](https://github.com/crobinson42/ts-pf/pull/26) [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01) Thanks [@crobinson42](https://github.com/crobinson42)! - Quote consumer skill `description` front matter so `npx skills experimental_sync` can install the skills. An unquoted `Triggers:` is invalid YAML, and the installer skipped every published skill.
- Updated dependencies [[`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01)]:
  - @ts-pf/contract@0.2.2
  - @ts-pf/protocol@0.2.1

## 0.4.1

### Patch Changes

- Updated dependencies [[`a2b4bdc`](https://github.com/crobinson42/ts-pf/commit/a2b4bdcbf7a51eae2e8ad919dcb5f92abebcb3ea)]:
  - @ts-pf/contract@0.2.1

## 0.4.0

### Minor Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`e7ccbb5`](https://github.com/crobinson42/ts-pf/commit/e7ccbb55b4431a10e8bd301cafc9eb21ff54984c) Thanks [@crobinson42](https://github.com/crobinson42)! - `impl.router()` now returns `ImplementedRouter<T, TCtx>` and every handler is an `ImplementedProcedure<TContract, TCtx>`: the contract procedure type and the `$context<C>()` type travel with the tree as phantom brands (optional, type-only members; the runtime shape is unchanged). Adapters read `TCtx` from the brand: `createLocalClient(app, { context })` now types `context` from it instead of `unknown`. Only the router-level brand is read: a tree not produced by `impl.router()` (a plain object of handlers, or a value annotated with the unparameterized `ImplementedRouter` / `ImplementedProcedure`) infers `unknown` even when its leaves are branded; use `impl.router()`, or pick procedures into a second `impl.router()` call, to keep the check. The brand members are declared `?: X | undefined`, so a mismatch is a plain TS2322 with a drill-down to the differing property rather than a TS2375 "consider adding undefined" under `exactOptionalPropertyTypes`. An implementer that never called `$context()` brands the tree with `object`, so a non-object `context` (a primitive, `null`, `undefined`) is rejected there.

  `impl.router()` is now `<I>(impl: I & RouterImplCheck<T, TCtx, I>)`. It rejects, naming the key: a missing key (`Missing implementation for "create"`), an extra key on a literal or a variable (`"list" is not in the contract`), a handler built from another procedure under this key (`star.find` in the `planet.find` slot), a slice built with a different `$context`, and a slice whose contract is a superset. Picked procedures (`{ list: usersApp.list }`) and same-`AppCtx` slices still compose; a slice that needs less context than the root provides is accepted. `ProcedureBuilder` gains a trailing `TContract` type parameter (default `unknown`), and `RouterImpl<T, TCtx = unknown>` now has branded leaves.

  Previously compiling code that can stop compiling, all of it intended: `createLocalClient(app, { context })` with a context that does not satisfy `$context<C>()`; `impl.router()` calls that nested a slice with a different `$context`, placed a handler under another procedure's key, or passed a variable with keys beyond the contract (the runtime already threw for extra and missing keys); and `expectTypeOf(find).toEqualTypeOf<ImplementedProcedure>()`-style exact-type assertions (`find` is now `ImplementedProcedure<typeof contract.planet.find, Ctx>`; `toExtend<ImplementedProcedure>()` holds).

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`d3498b5`](https://github.com/crobinson42/ts-pf/commit/d3498b57ed2d48b159b80f3c952e33a5824af77c) Thanks [@crobinson42](https://github.com/crobinson42)! - - A per-procedure `.use()` now accepts the same `MiddlewareFn<TCtx, unknown, unknown>` as `impl.use()`, so a middleware created with `impl.middleware(fn)` fits both `impl.use(mw)` and `impl.planet.find.use(mw)` (previously TS2345 on the output type, which forced inline functions). Inline `.use()` middleware now sees `next(): Promise<unknown>` instead of the procedure's output type; `.useAfter()` keeps the per-procedure input and output typing.

  - The `INTERNAL` `PFError` thrown for an output-schema failure (`validation.output: true`) carries the schema issues as `cause`, and the one thrown for invalid declared error `data` carries the original error as `cause`. `toJSON()` still omits `cause`, so the wire body is unchanged; a server log (for example `FetchHandler`'s default `console.error`) can now show why.
  - `lookupProcedure` reads own keys only (`Object.hasOwn`), so a path segment such as `constructor` or `__proto__` misses instead of reaching `Object.prototype` (the `isImplementedProcedure` guard already rejected those; this removes the walk).
  - Internal: `ContractShape` / `IsContractProcedure` derive from `@ts-pf/contract`'s new `InferContractProcedure`; `createImplementer`'s node factory is split into a router node (immutable) and a procedure node (short-lived builder) with the semantics documented; optional-field spreads use `defined()` from `@ts-pf/protocol`; the unused `assertContractProcedure` is removed from the source (it was never on the package index). `applyPlugins` and the two `next()` option types document ordering and merge-vs-replace semantics.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`3268bc4`](https://github.com/crobinson42/ts-pf/commit/3268bc4b3cb5b94ceb8e8cb6473b0d7785911b8d) Thanks [@crobinson42](https://github.com/crobinson42)! - `status` on errors is now honest: it is optional transport metadata with no default, set only where a transport really has one.

  **Type change (may stop existing code compiling).** `PFError.status` and `PFErrorInit.status` are `number | undefined` (`@ts-pf/protocol`), and every `ClientError` variant — so `asResult(...).error.status` too — is `status?: number` (`@ts-pf/contract`, surfaced through `@ts-pf/client`). Code that used `status` as a plain number (`err.status.toFixed()`, `err.status >= 500`, passing it to a `number` parameter) needs `?? 400` or a guard. Code that compares `err.status === 404` still compiles but was already only right over HTTP; switch on `err.code` instead.

  **Runtime values per transport, before → after:**

  | Transport                                                                                                                    | before               | after                           |
  | ---------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------- |
  | HTTP unary failure (`FetchLink`)                                                                                             | HTTP response status | unchanged: HTTP response status |
  | HTTP after a stream started (`StreamCodec` JSONL line, `SseCodec` `event: error`, `Stream truncated`, `Invalid error event`) | `200`                | `undefined`                     |
  | WebSocket / stdio / MessagePort (`errorFromEnvelope`)                                                                        | `400`                | `undefined`                     |
  | Local failure (`localFailure`)                                                                                               | `0` + `local: true`  | unchanged                       |
  | In-process (`createLocalClient`, `errors.CODE()` with no declared `status`)                                                  | `400`                | `undefined`                     |
  | In-process, declared `{ status: 404 }`                                                                                       | `404`                | unchanged                       |
  | `new PFError({ code })` with no `status`                                                                                     | `400`                | `undefined`                     |

  **Server-side HTTP responses are unchanged.** `httpStatus()` in `@ts-pf/http` now owns the HTTP default: protocol codes map to `PROTOCOL_HTTP_STATUS`, any other code uses `error.status ?? 400`. A declared error with `status: 404` is still HTTP 404; a declared error with no `status` is still HTTP 400. `httpStatus()` no longer special-cases `local: true` (it returned `0`, which is not a valid `Response.status`; a server never sees a local failure, and one would now map to `INTERNAL` → 500). `createErrorFactory` stamps a declared `ErrorDef.status` and nothing when the definition omits one. `toJSON()` and the wire envelope are unchanged: `{ code, message, data? }`, never `status`.

  **`@ts-pf/mvc-kit`:** mvc-kit classifies a thrown value by `code` only when `status` is a finite number, so `bindClient` now hands mvc-kit a copy of the `PFError` with `status: 400` whenever the transport did not carry one (message links, mid-stream failures, declared errors without `status`). `errorCode` stays the `PFError.code` on every `Link`; the original error is not mutated, and HTTP failures and `localFailure` (`status: 0`) pass through as-is. `bindClient` calls therefore return a chained promise rather than the link's own promise object.

### Patch Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only. READMEs that did not name every symbol in their skill's `## API` section gain a matching `API` list (`check:skills` now asserts it), and every fenced `ts` block in READMEs and skills now type-checks against `dist` (`check:snippets`): missing `procedure` / `z` / `catalog` / `spawn` / `FetchHandler` imports were added, Node-resolved relative imports carry `.js`, the server skill implements the whole example contract, and prose fragments are marked `no-check`.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb) Thanks [@crobinson42](https://github.com/crobinson42)! - Declare `engines.node >=22` and ship the MIT `LICENSE` file in the tarball.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`53aaa5a`](https://github.com/crobinson42/ts-pf/commit/53aaa5a33ffee876b237ef6a85744c99cd4aa7d1) Thanks [@crobinson42](https://github.com/crobinson42)! - Rewrite the package READMEs shown on npmjs.com: one-line role, the full install line, a role-specific server + client snippet, and absolute links to the root README and the package skill (the previous relative `../../README.md` link did not resolve on npm). The `ts-pf-client` skill now notes that `DedupePlugin` / `CachePlugin` key every unary call by default and shows `key` restricting them to reads.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`1505305`](https://github.com/crobinson42/ts-pf/commit/1505305f3d5df3547f5746243aa710f6a6d835c7) Thanks [@crobinson42](https://github.com/crobinson42)! - `runProcedure` now builds the `.use()` → input check → `.useAfter()` → handler chain once per `next()` invocation, so a `CallInterceptor` that calls `next()` more than once concurrently (hedging, shadowing, a retry that does not await the first attempt) gives each run its own `input`, `context`, and `signal`. Previously the three were shared closure variables and a second `next({ input })` could overwrite what a still-running first `next()` was about to hand the handler. Interceptors that call `next()` once, or sequentially, behave exactly as before; no wire or public type change.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`025c1c4`](https://github.com/crobinson42/ts-pf/commit/025c1c47ca5ec7484e2c3d388278c5fe8380c6e6) Thanks [@crobinson42](https://github.com/crobinson42)! - Internal refactor, no behaviour change: the "unknown throw becomes `INTERNAL`" mapping and the "is this a stream" predicate now come from `@ts-pf/protocol` (`toWireError`, `isAsyncIterable`) instead of a private copy in each package.

  - `@ts-pf/server-http` (`FetchHandler` error response), `@ts-pf/message-server` (`result` frames), `@ts-pf/stream` and `@ts-pf/sse` (in-band failure lines) encode failures with `toWireError`. The bytes on the wire are identical: `PFError` → `{ code, message, data? }`, anything else → `{ code: 'INTERNAL', message: 'Internal server error' }`. `onError` hooks and the default log still receive the original thrown value; HTTP status still comes from `httpStatus()`.
  - `@ts-pf/client` (`RetryPlugin`, `DedupePlugin`, `CachePlugin`) and `@ts-pf/server` (`DedupePlugin`, the `runProcedure` output wrap) use protocol `isAsyncIterable`. `@ts-pf/stream`, `@ts-pf/sse`, and `@ts-pf/message-server` compose it with the same `ReadableStream` exclusion they had before (a local `isItemStream`), so a `ReadableStream` is still a plain value, not a stream of items. `@ts-pf/swr` does not depend on `@ts-pf/protocol` and keeps a local copy (comment only). `@ts-pf/message-client` now depends on `@ts-pf/protocol` and composes the same `isItemStream` (see its own entry).

- Updated dependencies [[`f84277c`](https://github.com/crobinson42/ts-pf/commit/f84277c2d165088bc18fa1b8d4e795d46d836764), [`23f457e`](https://github.com/crobinson42/ts-pf/commit/23f457e4e47d5f39506034272b22c35417f11618), [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5), [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb), [`5e5a998`](https://github.com/crobinson42/ts-pf/commit/5e5a99848231e36d8bfa1ef57db9169aee6d9750), [`fb03a52`](https://github.com/crobinson42/ts-pf/commit/fb03a52ac4e8d520cd6b30c24331af8069de9cd5), [`025c1c4`](https://github.com/crobinson42/ts-pf/commit/025c1c47ca5ec7484e2c3d388278c5fe8380c6e6), [`53aaa5a`](https://github.com/crobinson42/ts-pf/commit/53aaa5a33ffee876b237ef6a85744c99cd4aa7d1), [`3268bc4`](https://github.com/crobinson42/ts-pf/commit/3268bc4b3cb5b94ceb8e8cb6473b0d7785911b8d)]:
  - @ts-pf/contract@0.2.0
  - @ts-pf/protocol@0.2.0

## 0.3.1

### Patch Changes

- Updated dependencies [276aa9e]
  - @ts-pf/contract@0.1.5

## 0.3.0

### Minor Changes

- 8cf3711: Output schema checks, including stream output items, run only when `validation.output` is true. Input checks stay on unless `validation.input` is false. Parsed output (strip, defaults, transforms) is applied only when output checks are on.

### Patch Changes

- Updated dependencies [8cf3711]
  - @ts-pf/protocol@0.1.2
  - @ts-pf/contract@0.1.4

## 0.2.2

### Patch Changes

- Updated dependencies [615fd9c]
  - @ts-pf/contract@0.1.3

## 0.2.1

### Patch Changes

- 92c5262: Point package `exports` at `dist`. npm does not rewrite `publishConfig.exports`, so published tarballs previously resolved to missing `src/` files.
- Updated dependencies [92c5262]
  - @ts-pf/contract@0.1.2
  - @ts-pf/protocol@0.1.1

## 0.2.0

### Minor Changes

- 1070bfa: Nest slice contracts and finished implementations with `router({ planet: planetContract })` and `impl.router({ planet: planetApp })`. Procedure `path` follows the composed tree. Each server still exports one contract for clients.

### Patch Changes

- Updated dependencies [1070bfa]
  - @ts-pf/contract@0.1.1

## 0.1.0

### Patch Changes

- First stable `0.1.0` release. Exit Changesets pre mode and publish to the npm `latest` dist-tag.
- Updated dependencies
  - @ts-pf/contract@0.1.0
  - @ts-pf/protocol@0.1.0

## 0.1.0-beta.2

### Patch Changes

- e85f033: Add npm `keywords` on every published package so the family is discoverable (typescript, rpc, typesafe, contract-first) with per-package terms for the pipe or adapter.
- Updated dependencies [e85f033]
  - @ts-pf/contract@0.1.0-beta.2
  - @ts-pf/protocol@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- Publish from GitHub Actions with npm trusted publishing (OIDC). No `NPM_TOKEN`.
- Updated dependencies
  - @ts-pf/contract@0.1.0-beta.1
  - @ts-pf/protocol@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 5ffff32: First public beta of the `@ts-pf` packages. Contract-first TypeScript RPC: one procedure model, Fetch and message adapters, and opt-in file, stream, SSE, docs, OpenAPI, codegen, SWR, and mvc-kit packages.

### Patch Changes

- 5ffff32: Ship a consumer agent skill with each package (`skills/ts-pf-<name>/SKILL.md`, plus hub `ts-pf-app` on `@ts-pf/contract`). After install or `npm update`: `npx skills experimental_sync -y`. Skills version with the package. Do not put this on a library `postinstall`.
- Updated dependencies [5ffff32]
- Updated dependencies [5ffff32]
  - @ts-pf/contract@0.1.0-beta.0
  - @ts-pf/protocol@0.1.0-beta.0
