# @ts-pf/contract

## 1.0.0

### Major Changes

- [#72](https://github.com/crobinson42/ts-pf/pull/72) [`1d9c401`](https://github.com/crobinson42/ts-pf/commit/1d9c401c3298429a4f49edea751338b47f9c3224) Thanks [@crobinson42](https://github.com/crobinson42)! - ts-pf 1.0. Every `@ts-pf/*` package follows semver from this release: patches and minors never break correct code, and breaking changes wait for a major. All packages still release together on one version.
  
  **Install and update.** Internal `@ts-pf/*` dependencies are now caret ranges (`^1.0.0`) instead of exact pins. Within 1.x, `npm update`, Renovate or Dependabot keep one copy of each package, even when the packages update one at a time. Keep every `@ts-pf/*` package on the same major.
  
  **Breaking changes.** Most are renames or removals that a find-and-replace covers:
  
  | Package | Before | After |
  | --- | --- | --- |
  | `@ts-pf/http` (and every setup snippet) | `JSONCodec` | `JsonCodec` |
  | `@ts-pf/client-http` | `Interceptor` | `FetchInterceptor` |
  | `@ts-pf/mcp` (`./meta`) | `Effect` | `McpEffect` |
  | `@ts-pf/mcp` | `MapperOpts` | `MapperOptions` |
  | `@ts-pf/message` | `localFailure` (deprecated re-export) | import `localFailure` from `@ts-pf/protocol` |
  | `@ts-pf/contract` | `ContractBuilder` as a value | type only (`procedure` builds one) |
  | `@ts-pf/contract` | `assertContractRouter`, `isStandardSchema` | removed (undocumented internals) |
  | `@ts-pf/docs` | `tryToJsonSchema` | removed (use `toJsonSchema`) |
  | `@ts-pf/sse` | `SseCodec`, `SSE_CONTENT_TYPE` from `@ts-pf/sse` | import them from `@ts-pf/stream`; uninstall `@ts-pf/sse` (no longer published) |
  | `@ts-pf/server` | `MiddlewareFn<TCtx, TInput, TOutput>` | `MiddlewareFn<TCtx, TAdded, TInput, TOutput>`; a middleware must return `next()`'s result (spread it to change the value) |
  
  **Middleware narrows context.** `next({ context: { user } })` now types `user` for the middleware and handlers built after it: `const authed = impl.use(requireUser)`, then `authed.planet.create.handler(({ context }) => context.user.id)`. `$context<C>()` stays what adapters supply and what the router is branded with, so `FetchHandler`, `createLocalClient` and `impl.router()` checks are unchanged. Drop the optional placeholder keys (`user?: User`) and checking helpers you used to narrow in the handler. An added key may narrow an existing one but not change its type.
  
  **`@ts-pf/sse` is merged into `@ts-pf/stream`.** `SseCodec` and `SSE_CONTENT_TYPE` are exports of `@ts-pf/stream`; `@ts-pf/sse` is no longer published.
  
  **Peer ranges are capped at the tested major:** `astro >=7.0.0 <8`, `mvc-kit >=4.9.0 <5`, `swr >=2.2.0 <3`. Support for a new peer major ships as a ts-pf minor after testing.
  
  Exports tagged `@internal` are shared between ts-pf packages and make no promise to consumers: `@ts-pf/message` `resolveBackpressure`, `DrainWaiter`, `Backpressure`, `DrainOutcome` and `frameByteLength`, and `@ts-pf/server` `isImplementedProcedure`. Do not import them.

## 0.7.0

No changes in this release.

## 0.6.1

### Patch Changes

- [#68](https://github.com/crobinson42/ts-pf/pull/68) [`966f952`](https://github.com/crobinson42/ts-pf/commit/966f9520ad3a84e63c075775637eb56c909ad66d) Thanks [@crobinson42](https://github.com/crobinson42)! - Typed clients now accept a union input. Before, a procedure whose input schema is a union (`z.union`, `z.discriminatedUnion`) gave a call signature that no input could satisfy (`Type 'string' is not assignable to type 'never'`). This affected every client built on `ContractClient`, including `createClient` and `createAstroClient`. The input type now stays one union. An input that accepts `undefined` (`.optional()`, `z.unknown()`, `z.any()`) can now be left out: `client.x()`.
  
  - `@ts-pf/contract`: `ProcedureClient` keeps a union input as one parameter type, and makes the input optional when it accepts `undefined`.
  - `@ts-pf/swr`: `key()` accepts a union input, and takes no argument when the input accepts `undefined`.

## 0.6.0

### Minor Changes

- [#66](https://github.com/crobinson42/ts-pf/pull/66) [`eeff84e`](https://github.com/crobinson42/ts-pf/commit/eeff84e41a400aed328b5f791bd706d06c407fa1) Thanks [@crobinson42](https://github.com/crobinson42)! - Expandable outputs. `procedure.input(I).output(Wide).expand({ key: 'populate', at?: ['docs'], fields: { authorId: User } })` makes a procedure's output type follow a list in its input. `client.posts.get({ id, populate: ['authorId'] })` returns `authorId` as `User`; without the list it is the plain id type. This works on every client (`createClient`, `createLocalClient`, swr, mvc-kit, astro, and codegen output) with no wrapper. `.output()` stays the wide schema, so the wire and the server do not change.
  
  - `@ts-pf/contract`: `.expand()`, the `Expansion<Key, At, Fields>` type (the hand-writable 6th `ContractProcedure` parameter; `Fields` are output types), `InferExpandedOutput<T, P>`, and `ContractExpandDef`. `InferContractProcedure` gains `expand`, and `ProcedureClient` gains an optional 4th parameter.
  - `@ts-pf/swr`: the callable and `.call` narrow. `key` / `fetcher` / `mutator` stay wide; annotate those with `InferExpandedOutput`.
  - `@ts-pf/docs`: `CatalogProcedure.expand` (`CatalogExpand`).
  - `@ts-pf/codegen`: `emit` / `emitFiles` print the `Expansion` argument. `diffCatalog` reports `expand-*` changes (a removal is breaking; an addition is safe).
  - `@ts-pf/openapi`: `x-ts-pf-expand: { key, at, fields }` on the operation.

## 0.5.2

### Patch Changes

- [#64](https://github.com/crobinson42/ts-pf/pull/64) [`13e63db`](https://github.com/crobinson42/ts-pf/commit/13e63db9186f9fd093c2f934dec2cabcd35beef3) Thanks [@crobinson42](https://github.com/crobinson42)! - Type client input with the input schema's input type, so a `.default()` field is optional at the call site (`client.posts.create({ title })`) and a `.transform()` input takes its source type. Handlers and `.useAfter()` still receive the parsed output type. `ContractProcedure` gains a fifth type parameter, `TParsedInput` (defaults to `TInput`, so hand-written and codegen `ContractProcedure<I, O>` types are unchanged), and `InferContractProcedure` returns `parsedInput` beside `input`. `stream(item)` input items follow the same split. `@ts-pf/swr` keys use the caller input type. Type-only: no runtime or wire change.

## 0.5.1

### Patch Changes

- [#61](https://github.com/crobinson42/ts-pf/pull/61) [`6fca318`](https://github.com/crobinson42/ts-pf/commit/6fca3182b414f0223dd7d58b2d8f97f048692ce2) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs: link the new "Clients in other languages" guide from `PROTOCOL.md`, the conformance fixtures README, the protocol and openapi READMEs, the protocol and openapi skills, and the `ts-pf-app` hub skill. The fixtures README gains a "Getting the files" section with version-pinned jsDelivr / unpkg URLs, and the openapi README says to generate models only (the call layer classifies by envelope, not HTTP status).

## 0.5.0

### Minor Changes

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`7de78ce`](https://github.com/crobinson42/ts-pf/commit/7de78ce883a8e24801934ef7853f32850d0644ec) Thanks [@crobinson42](https://github.com/crobinson42)! - Export the pieces of the built-in input-validation failure for handlers that validate themselves (for example under `validation: { input: false }`): `toValidationIssues(issues)` from `@ts-pf/contract` turns Standard Schema issues into `ValidationIssue[]` with the same path normalization the built-in adapter applies, and `validationError(issues)` from `@ts-pf/server` builds the same `VALIDATION` `PFError` the input check throws. `runProcedure` and `@ts-pf/mcp` now build that error with `validationError` (output unchanged). The docs note that with `validation.input: false` the handler's `input` is the raw value although its type says parsed.

### Patch Changes

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`e81b871`](https://github.com/crobinson42/ts-pf/commit/e81b87125b359d488734273603bb313bdf00624a) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs: evolving a contract and a domain error catalog recipe.
  
  - `@ts-pf/server`: the README and skill add a domain error catalog recipe to "Mapping domain errors": a code → message catalog owned by the domain layer, a status map where `null` means "not exposed to clients" (sent as `INTERNAL`), the client-facing error map derived from it for `procedure.errors()`, and a shared mapping middleware typed with `MiddlewareFn` that leaves non-domain errors unchanged and relies on the declared `status` being filled in.
  - `@ts-pf/contract`: the hub skill links the new "Evolving a contract" guide (safe vs breaking changes, catch-all branches for new error codes and enum values, deprecation, shared vs per-procedure error maps, catalog diffs in CI).

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`82fdd63`](https://github.com/crobinson42/ts-pf/commit/82fdd63d04e6732d96f8b792627bcaf69f569cf3) Thanks [@crobinson42](https://github.com/crobinson42)! - `ts-pf-app` skill: name the `@ts-pf/codegen` breaking-change check (`diffCatalog` / `ts-pf-codegen diff`) in the capability and public-names tables.

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798) Thanks [@crobinson42](https://github.com/crobinson42)! - Every published `@ts-pf/*` package now releases together on one version (a Changesets `fixed` group), starting with this release; that is why this package's version jumps. Keep all `@ts-pf/*` dependencies on the same version and update them together in one install command: internal dependencies are exact pins, so a mixed set installs duplicate copies of shared packages such as `@ts-pf/protocol`.

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`09140cd`](https://github.com/crobinson42/ts-pf/commit/09140cd8c927d04953479f9f56f3449b3a30459c) Thanks [@crobinson42](https://github.com/crobinson42)! - Server and catalog DX improvements.
  
  - `@ts-pf/server`: add `mapStreamErrors(value, fn)`. Wraps an async iterable so a throw during iteration is replaced by `fn(error)`, and returns any other value unchanged, so one `.use()` middleware can map domain errors to declared codes for unary and stream procedures alike (`return mapStreamErrors(await next(), mapError)`). Mapped errors still get the declared-error `data` check. The README and skill also document that middleware `next()` must be called at most once (use a `CallInterceptor` for retries), that the handler `signal` may be absent for in-process callers, and an auth-middleware-plus-narrowing-helper pattern for context keys middleware adds.
  - `@ts-pf/docs`: `docs('…')` is shorthand for `docs({ description: '…' })`. `catalog(contract, { requireDescription: true })` throws an error listing every catalog procedure without a `docs()` description or summary (default `false`).
  - `@ts-pf/server-http`: document that a `HandlerPlugin.onRequest` that throws a `PFError` is answered through the normal error path, e.g. `NOT_FOUND` for a procedure that should not be served over HTTP.
  - `@ts-pf/message-client`: the skill notes that a drain stall is always `INTERNAL` with a fixed message, distinct from app-defined error codes.
  - `@ts-pf/contract`: the hub skill shows the `docs('…')` shorthand.

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`c001422`](https://github.com/crobinson42/ts-pf/commit/c001422da0b1bc8d379cab560e4b83c19bf9fa60) Thanks [@crobinson42](https://github.com/crobinson42)! - The `ts-pf-app` skill now says to keep every `@ts-pf/*` package on the same version and update them together, and adds a lint rule that keeps server-only and Node-only entry points (`@ts-pf/server`, `@ts-pf/server-http`, `@ts-pf/message-server`, `@ts-pf/astro/server`, `@ts-pf/mcp`, the `stdio` subpaths, `@ts-pf/codegen`) out of browser bundles.

## 0.2.4

### Patch Changes

- [#42](https://github.com/crobinson42/ts-pf/pull/42) [`44d5c83`](https://github.com/crobinson42/ts-pf/commit/44d5c8350d2370161fa092ee7725e860f0adbc2d) Thanks [@crobinson42](https://github.com/crobinson42)! - Published types no longer import the optional `typebox` peer, so a project can type-check `@ts-pf/contract` with `skipLibCheck` off without installing `typebox`. TypeBox schemas still infer.

## 0.2.3

### Patch Changes

- [#32](https://github.com/crobinson42/ts-pf/pull/32) [`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only, no API or wire change. The `ts-pf-server-http` skill gains "Cacheable reads and public REST (userland)": a smoke-tested GET bridge (`HandlerPlugin` + Fetch `Interceptor`, in `examples/plugins`) that serves opted-in reads as `GET {prefix}/{path}?input=<JSON>` with `Cache-Control`, plus a REST facade over `createLocalClient`. The `ts-pf-openapi` skill shows how to add the bridge's `get` operations to the generated document; `ts-pf-client-http`, `ts-pf-docs`, and the `ts-pf-app` hub point at it; `PROTOCOL.md` notes that such a bridge sits outside the v1 wire.

## 0.2.2

### Patch Changes

- [#26](https://github.com/crobinson42/ts-pf/pull/26) [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01) Thanks [@crobinson42](https://github.com/crobinson42)! - Quote consumer skill `description` front matter so `npx skills experimental_sync` can install the skills. An unquoted `Triggers:` is invalid YAML, and the installer skipped every published skill.

## 0.2.1

### Patch Changes

- [#20](https://github.com/crobinson42/ts-pf/pull/20) [`a2b4bdc`](https://github.com/crobinson42/ts-pf/commit/a2b4bdcbf7a51eae2e8ad919dcb5f92abebcb3ea) Thanks [@crobinson42](https://github.com/crobinson42)! - `ts-pf-app` hub skill: list `@ts-pf/mcp` (MCP tools) in the capability catalog with its one-call snippet.

## 0.2.0

### Minor Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`f84277c`](https://github.com/crobinson42/ts-pf/commit/f84277c2d165088bc18fa1b8d4e795d46d836764) Thanks [@crobinson42](https://github.com/crobinson42)! - Export `InferContractProcedure<T>` (`{ input, output, errors, meta }` of one procedure type, or `never`) and `IsContractProcedure<T>`. `ContractBuilder` now declares the same phantom `~types` as `ContractProcedure` (a `declare` field; nothing is emitted), so one `ContractProcedure<infer …>` branch reads builders and codegen-written procedures alike. The internal `InferContract*` / `ContractClient` types derive from it and test for "not a procedure" with `[X] extends [never]`.

  Observable type change, intended: two builders with different input or output are no longer mutually assignable (they were, because the type parameters only appeared in method return types). `ROUTER_BRAND` (an unused internal constant) is removed from the source; it was never on the package index.

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

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`23f457e`](https://github.com/crobinson42/ts-pf/commit/23f457e4e47d5f39506034272b22c35417f11618) Thanks [@crobinson42](https://github.com/crobinson42)! - Type-only export added: `ContractProtocolErrorCode`, the closed protocol error-code union that `ClientError` falls back to.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only. READMEs that did not name every symbol in their skill's `## API` section gain a matching `API` list (`check:skills` now asserts it), and every fenced `ts` block in READMEs and skills now type-checks against `dist` (`check:snippets`): missing `procedure` / `z` / `catalog` / `spawn` / `FetchHandler` imports were added, Node-resolved relative imports carry `.js`, the server skill implements the whole example contract, and prose fragments are marked `no-check`.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb) Thanks [@crobinson42](https://github.com/crobinson42)! - Declare `engines.node >=22` and ship the MIT `LICENSE` file in the tarball.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`53aaa5a`](https://github.com/crobinson42/ts-pf/commit/53aaa5a33ffee876b237ef6a85744c99cd4aa7d1) Thanks [@crobinson42](https://github.com/crobinson42)! - Rewrite the package READMEs shown on npmjs.com: one-line role, the full install line, a role-specific server + client snippet, and absolute links to the root README and the package skill (the previous relative `../../README.md` link did not resolve on npm). The `ts-pf-client` skill now notes that `DedupePlugin` / `CachePlugin` key every unary call by default and shows `key` restricting them to reads.

## 0.1.5

### Patch Changes

- 276aa9e: Add `@ts-pf/astro` for Astro API routes (`createAstroHandler`) and in-process page calls (`createAstroLocalClient`). Browser and island code uses `createAstroClient`. The contract skill catalog lists the package.

## 0.1.4

### Patch Changes

- 8cf3711: Output schema checks, including stream output items, run only when `validation.output` is true. Input checks stay on unless `validation.input` is false. Parsed output (strip, defaults, transforms) is applied only when output checks are on.

## 0.1.3

### Patch Changes

- 615fd9c: Make `ts-pf-app` the consumer capability catalog: opt-in packages (file, stream, SSE, message, docs/OpenAPI/codegen, SWR, mvc-kit) are discoverable from the hub that ships with `@ts-pf/contract`, then `npm i` + `npx skills experimental_sync -y` loads the versioned package skill.

## 0.1.2

### Patch Changes

- 92c5262: Point package `exports` at `dist`. npm does not rewrite `publishConfig.exports`, so published tarballs previously resolved to missing `src/` files.

## 0.1.1

### Patch Changes

- 1070bfa: Nest slice contracts and finished implementations with `router({ planet: planetContract })` and `impl.router({ planet: planetApp })`. Procedure `path` follows the composed tree. Each server still exports one contract for clients.

## 0.1.0

### Patch Changes

- First stable `0.1.0` release. Exit Changesets pre mode and publish to the npm `latest` dist-tag.

## 0.1.0-beta.2

### Patch Changes

- e85f033: Add npm `keywords` on every published package so the family is discoverable (typescript, rpc, typesafe, contract-first) with per-package terms for the pipe or adapter.

## 0.1.0-beta.1

### Patch Changes

- Publish from GitHub Actions with npm trusted publishing (OIDC). No `NPM_TOKEN`.

## 0.1.0-beta.0

### Minor Changes

- 5ffff32: First public beta of the `@ts-pf` packages. Contract-first TypeScript RPC: one procedure model, Fetch and message adapters, and opt-in file, stream, SSE, docs, OpenAPI, codegen, SWR, and mvc-kit packages.

### Patch Changes

- 5ffff32: Ship a consumer agent skill with each package (`skills/ts-pf-<name>/SKILL.md`, plus hub `ts-pf-app` on `@ts-pf/contract`). After install or `npm update`: `npx skills experimental_sync -y`. Skills version with the package. Do not put this on a library `postinstall`.
