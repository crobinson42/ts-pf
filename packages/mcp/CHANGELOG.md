# @ts-pf/mcp

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

### Patch Changes

- Updated dependencies [[`1d9c401`](https://github.com/crobinson42/ts-pf/commit/1d9c401c3298429a4f49edea751338b47f9c3224)]:
  - @ts-pf/contract@1.0.0
  - @ts-pf/docs@1.0.0
  - @ts-pf/protocol@1.0.0
  - @ts-pf/server@1.0.0

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @ts-pf/contract@0.7.0
  - @ts-pf/docs@0.7.0
  - @ts-pf/protocol@0.7.0
  - @ts-pf/server@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`966f952`](https://github.com/crobinson42/ts-pf/commit/966f9520ad3a84e63c075775637eb56c909ad66d)]:
  - @ts-pf/contract@0.6.1
  - @ts-pf/docs@0.6.1
  - @ts-pf/server@0.6.1
  - @ts-pf/protocol@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [[`eeff84e`](https://github.com/crobinson42/ts-pf/commit/eeff84e41a400aed328b5f791bd706d06c407fa1)]:
  - @ts-pf/contract@0.6.0
  - @ts-pf/docs@0.6.0
  - @ts-pf/server@0.6.0
  - @ts-pf/protocol@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies [[`13e63db`](https://github.com/crobinson42/ts-pf/commit/13e63db9186f9fd093c2f934dec2cabcd35beef3)]:
  - @ts-pf/contract@0.5.2
  - @ts-pf/server@0.5.2
  - @ts-pf/docs@0.5.2
  - @ts-pf/protocol@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies [[`6fca318`](https://github.com/crobinson42/ts-pf/commit/6fca3182b414f0223dd7d58b2d8f97f048692ce2)]:
  - @ts-pf/protocol@0.5.1
  - @ts-pf/contract@0.5.1
  - @ts-pf/docs@0.5.1
  - @ts-pf/server@0.5.1

## 0.5.0

### Patch Changes

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798) Thanks [@crobinson42](https://github.com/crobinson42)! - Every published `@ts-pf/*` package now releases together on one version (a Changesets `fixed` group), starting with this release; that is why this package's version jumps. Keep all `@ts-pf/*` dependencies on the same version and update them together in one install command: internal dependencies are exact pins, so a mixed set installs duplicate copies of shared packages such as `@ts-pf/protocol`.

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`e32afd5`](https://github.com/crobinson42/ts-pf/commit/e32afd5c369fea7e9e3b2a7b772546ab134df26c) Thanks [@crobinson42](https://github.com/crobinson42)! - Add `isUnexpectedError(error)` to `@ts-pf/protocol`: `true` for any value that is not a `PFError` and for a `PFError` whose code is `INTERNAL`. It is the filter `FetchHandler` and `@ts-pf/mcp` use for their default `console.error` logging (now implemented with it; behaviour unchanged), so a custom `onError` can keep the same filter: `onError: (e) => { if (isUnexpectedError(e)) logger.error(e) }`.

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`7de78ce`](https://github.com/crobinson42/ts-pf/commit/7de78ce883a8e24801934ef7853f32850d0644ec) Thanks [@crobinson42](https://github.com/crobinson42)! - Export the pieces of the built-in input-validation failure for handlers that validate themselves (for example under `validation: { input: false }`): `toValidationIssues(issues)` from `@ts-pf/contract` turns Standard Schema issues into `ValidationIssue[]` with the same path normalization the built-in adapter applies, and `validationError(issues)` from `@ts-pf/server` builds the same `VALIDATION` `PFError` the input check throws. `runProcedure` and `@ts-pf/mcp` now build that error with `validationError` (output unchanged). The docs note that with `validation.input: false` the handler's `input` is the raw value although its type says parsed.
- Updated dependencies [[`e81b871`](https://github.com/crobinson42/ts-pf/commit/e81b87125b359d488734273603bb313bdf00624a), [`d47d657`](https://github.com/crobinson42/ts-pf/commit/d47d65766943cbbc02411f27961e8da3f93d33a9), [`29c8fac`](https://github.com/crobinson42/ts-pf/commit/29c8fac45a3be7a01eaffd2a490671190e6d6516), [`82fdd63`](https://github.com/crobinson42/ts-pf/commit/82fdd63d04e6732d96f8b792627bcaf69f569cf3), [`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798), [`26d42ca`](https://github.com/crobinson42/ts-pf/commit/26d42ca895f73451d81f6198f659acf8fcb0e7ee), [`a603b5c`](https://github.com/crobinson42/ts-pf/commit/a603b5cfec1d52d385d5fa7eab098d9415cb90dd), [`d772f61`](https://github.com/crobinson42/ts-pf/commit/d772f61b4c8c27b134c3f7185498bb94964d8b3e), [`09140cd`](https://github.com/crobinson42/ts-pf/commit/09140cd8c927d04953479f9f56f3449b3a30459c), [`c001422`](https://github.com/crobinson42/ts-pf/commit/c001422da0b1bc8d379cab560e4b83c19bf9fa60), [`675edb7`](https://github.com/crobinson42/ts-pf/commit/675edb75df8e400dfc70474b60989b59ff464375), [`e32afd5`](https://github.com/crobinson42/ts-pf/commit/e32afd5c369fea7e9e3b2a7b772546ab134df26c), [`7de78ce`](https://github.com/crobinson42/ts-pf/commit/7de78ce883a8e24801934ef7853f32850d0644ec), [`4c7ba42`](https://github.com/crobinson42/ts-pf/commit/4c7ba42a4b64aa44ac3ddc86ca9858d100c74784)]:
  - @ts-pf/server@0.5.0
  - @ts-pf/contract@0.5.0
  - @ts-pf/docs@0.5.0
  - @ts-pf/protocol@0.5.0

## 0.3.0

### Minor Changes

- [#44](https://github.com/crobinson42/ts-pf/pull/44) [`f74a03b`](https://github.com/crobinson42/ts-pf/commit/f74a03b18c9fa8469c3479f7cc858ba82b757a82) Thanks [@crobinson42](https://github.com/crobinson42)! - Pluggable host search. `bindTools(toolset, { search })` takes a `SearchFactory`: `bm25Search()` (the default, unchanged), `denseSearch({ embed, minScore? })`, or `hybridSearch({ embed, minScore? })` (BM25 and embeddings merged by reciprocal rank fusion). `embed(texts, { kind, signal })` is supplied by the app, so it can be an in-process model (transformers.js) or a hosted API, and `@ts-pf/mcp` adds no dependency. Tool vectors are embedded on the first query and cached; no vector database is involved. `hybridSearch` falls back to BM25 when `embed` fails and reports the error to `onError`; `denseSearch` returns an error result. The README now documents host discovery arguments, defaults, and results, and corrects what `onError` receives.

## 0.2.3

### Patch Changes

- Updated dependencies [[`44d5c83`](https://github.com/crobinson42/ts-pf/commit/44d5c8350d2370161fa092ee7725e860f0adbc2d)]:
  - @ts-pf/contract@0.2.4
  - @ts-pf/docs@0.1.12
  - @ts-pf/server@0.4.4

## 0.2.2

### Patch Changes

- Updated dependencies [[`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3)]:
  - @ts-pf/docs@0.1.11
  - @ts-pf/contract@0.2.3
  - @ts-pf/protocol@0.2.2
  - @ts-pf/server@0.4.3

## 0.2.1

### Patch Changes

- [#27](https://github.com/crobinson42/ts-pf/pull/27) [`2cab8d4`](https://github.com/crobinson42/ts-pf/commit/2cab8d4ae9969ba61d043dc27c1cc926bfbbe8a2) Thanks [@crobinson42](https://github.com/crobinson42)! - `all(node, { inject })` reads keys from intersection / `allOf` inputs (TypeBox `Type.Intersect`, Zod record intersections) and record, loose, and catchall inputs, and injected keys are removed from every `allOf` member of the model schema, so the model cannot set them. `all()` throws when `inject` is set and a selected procedure's input has no readable JSON Schema. An `inject` key must be a declared field of some selected input: a record input no longer makes a typo like `tenantID` compile (which left `tenantId` to the model on every other tool), and `all()` throws on such a key at runtime too. For an input that is only a record, use `.inject()` on that tool. `audit()` no longer reports an error for an injected key on an `allOf` root; the key is removed, and the union / `allOf` root warning still applies.

- [#26](https://github.com/crobinson42/ts-pf/pull/26) [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01) Thanks [@crobinson42](https://github.com/crobinson42)! - Quote consumer skill `description` front matter so `npx skills experimental_sync` can install the skills. An unquoted `Triggers:` is invalid YAML, and the installer skipped every published skill.
- Updated dependencies [[`491a8c1`](https://github.com/crobinson42/ts-pf/commit/491a8c1146309caf305c8bc62c874e3a7aba3a05), [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01)]:
  - @ts-pf/server@0.4.2
  - @ts-pf/contract@0.2.2
  - @ts-pf/docs@0.1.10
  - @ts-pf/protocol@0.2.1

## 0.2.0

### Minor Changes

- [#22](https://github.com/crobinson42/ts-pf/pull/22) [`c47e72c`](https://github.com/crobinson42/ts-pf/commit/c47e72c54411099bd21b5c7e2ade943cf162086b) Thanks [@crobinson42](https://github.com/crobinson42)! - Per-caller tool lists, OAuth scope step-up, and type-level `tags` / `hidden` filtering.
  
  - `.visible((info) => boolean)` on tools, `all(node, { visible })`, `$tool({ visible })`, and `$host({ visible })`. `McpTools.list(info)` filters per caller; a call to a hidden tool answers like an unknown tool. Inside a host, discovery, the `get_*` description, the `call_*` name enum, and annotations follow what the caller may see.
  - `.scopes([...])` on tools, `all(node, { scopes })`, and `$tool({ scopes })`. `createMcpFactory` registers an SDK `scopeChallenge`, so over HTTP a token missing a scope gets `403 insufficient_scope` (granted plus required scopes) and the client can re-consent. A host's `call_*` challenges per inner tool, never for one hidden from the caller. New optional async `McpTools.scopesFor(name, args, info?)`.
  - `all({ tags })` and literal `docs({ hidden: true })` now filter at the type level (with `docs()` from `@ts-pf/docs` 0.1.9 or later in contract files), and `$coverage` treats literal-hidden procedures as decided. `all()` result types no longer include literal-hidden procedures, so code that read such a key stops compiling. `all({ tags: [] })` now filters nothing (it used to drop every tool).
  - The `@modelcontextprotocol/server` peer range widens to `>=2.3.0 <3`.
  - A per-caller `client: (info) => …` runs once per tool call and is shared with mapper `call`.
  - Host descriptions say "this capability" for a single inner tool.

### Patch Changes

- Updated dependencies [[`c47e72c`](https://github.com/crobinson42/ts-pf/commit/c47e72c54411099bd21b5c7e2ade943cf162086b)]:
  - @ts-pf/docs@0.1.9

## 0.1.0

### Minor Changes

- [#20](https://github.com/crobinson42/ts-pf/pull/20) [`a2b4bdc`](https://github.com/crobinson42/ts-pf/commit/a2b4bdcbf7a51eae2e8ad919dcb5f92abebcb3ea) Thanks [@crobinson42](https://github.com/crobinson42)! - New opt-in package: MCP tools from a ts-pf contract. `@ts-pf/mcp/meta` adds `mcp({ effect, description, aliases })` for contract files. `@ts-pf/mcp` adds `createToolkit` (typed builders with `.describe` / `.effect` / `.inject` / `.input` / `.output` / `.errors` / `.examples`, plus `$context` / `$tool` / `$host` / `$toolset` / `$coverage`), `all()`, `bindTools` (in-process `app` or remote `client`), and `audit()`. `@ts-pf/mcp/sdk` adds `createMcpFactory`, a per-request `McpServer` factory for `@modelcontextprotocol/server` v2 (`createMcpHandler` / `serveStdio`), from an `app` or bound tools.

### Patch Changes

- Updated dependencies [[`a2b4bdc`](https://github.com/crobinson42/ts-pf/commit/a2b4bdcbf7a51eae2e8ad919dcb5f92abebcb3ea)]:
  - @ts-pf/contract@0.2.1
  - @ts-pf/docs@0.1.8
  - @ts-pf/server@0.4.1
