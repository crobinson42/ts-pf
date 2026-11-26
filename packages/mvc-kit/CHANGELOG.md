# @ts-pf/mvc-kit

## 1.0.1

### Patch Changes

- Updated dependencies []:
  - @ts-pf/contract@1.0.1

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

## 0.7.0

### Minor Changes

- [#69](https://github.com/crobinson42/ts-pf/pull/69) [`85c20ab`](https://github.com/crobinson42/ts-pf/commit/85c20ab64fd358365fe34a0b606fe8d228cd6b0a) Thanks [@crobinson42](https://github.com/crobinson42)! - `issuesToFieldErrors` now keys each issue by the first segment of its path, the top-level field a `FormModel` knows. Before, a nested issue got a dotted key (`'address.city'`) that `FormModel.setErrors` stored but no field read. The error never showed, and the form stayed invalid until `clearErrors()`. Now `['address', 'city']` lands on `address`, and the first issue per field wins.
  
  New `at` option: `issuesToFieldErrors(issues, { at: ['address'] })` keeps only the issues under that path, keyed relative to it, for the `FormModel` of a nested object or array row (`{ at: ['items', i] }`). New exported type `IssuesToFieldErrorsOptions`.
  
  Breaking for callers that read the dotted keys: map `issues` yourself, or use `at`.

### Patch Changes

- Updated dependencies []:
  - @ts-pf/contract@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`966f952`](https://github.com/crobinson42/ts-pf/commit/966f9520ad3a84e63c075775637eb56c909ad66d)]:
  - @ts-pf/contract@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [[`eeff84e`](https://github.com/crobinson42/ts-pf/commit/eeff84e41a400aed328b5f791bd706d06c407fa1)]:
  - @ts-pf/contract@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies [[`13e63db`](https://github.com/crobinson42/ts-pf/commit/13e63db9186f9fd093c2f934dec2cabcd35beef3)]:
  - @ts-pf/contract@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies [[`6fca318`](https://github.com/crobinson42/ts-pf/commit/6fca3182b414f0223dd7d58b2d8f97f048692ce2)]:
  - @ts-pf/contract@0.5.1

## 0.5.0

### Patch Changes

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798) Thanks [@crobinson42](https://github.com/crobinson42)! - Every published `@ts-pf/*` package now releases together on one version (a Changesets `fixed` group), starting with this release; that is why this package's version jumps. Keep all `@ts-pf/*` dependencies on the same version and update them together in one install command: internal dependencies are exact pins, so a mixed set installs duplicate copies of shared packages such as `@ts-pf/protocol`.

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`26d42ca`](https://github.com/crobinson42/ts-pf/commit/26d42ca895f73451d81f6198f659acf8fcb0e7ee) Thanks [@crobinson42](https://github.com/crobinson42)! - `isPFError` now recognises a `PFError` from another installed copy of `@ts-pf/protocol` (version skew, or a bundler that inlined one). Before, such an error failed the check, so `toWireError` sent a typed failure as `INTERNAL` and `FetchLink` wrapped one thrown by a Fetch interceptor as a local failure. `PFError.prototype` carries a non-enumerable `Symbol.for('ts-pf.PFError')` brand; instances gain no own property. `FetchLink` and `bindClient` use the same check.
- Updated dependencies [[`e81b871`](https://github.com/crobinson42/ts-pf/commit/e81b87125b359d488734273603bb313bdf00624a), [`82fdd63`](https://github.com/crobinson42/ts-pf/commit/82fdd63d04e6732d96f8b792627bcaf69f569cf3), [`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798), [`09140cd`](https://github.com/crobinson42/ts-pf/commit/09140cd8c927d04953479f9f56f3449b3a30459c), [`c001422`](https://github.com/crobinson42/ts-pf/commit/c001422da0b1bc8d379cab560e4b83c19bf9fa60), [`7de78ce`](https://github.com/crobinson42/ts-pf/commit/7de78ce883a8e24801934ef7853f32850d0644ec)]:
  - @ts-pf/contract@0.5.0

## 0.1.10

### Patch Changes

- Updated dependencies [[`44d5c83`](https://github.com/crobinson42/ts-pf/commit/44d5c8350d2370161fa092ee7725e860f0adbc2d)]:
  - @ts-pf/contract@0.2.4

## 0.1.9

### Patch Changes

- Updated dependencies [[`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3)]:
  - @ts-pf/contract@0.2.3

## 0.1.8

### Patch Changes

- [#26](https://github.com/crobinson42/ts-pf/pull/26) [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01) Thanks [@crobinson42](https://github.com/crobinson42)! - Quote consumer skill `description` front matter so `npx skills experimental_sync` can install the skills. An unquoted `Triggers:` is invalid YAML, and the installer skipped every published skill.
- Updated dependencies [[`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01)]:
  - @ts-pf/contract@0.2.2

## 0.1.7

### Patch Changes

- Updated dependencies [[`a2b4bdc`](https://github.com/crobinson42/ts-pf/commit/a2b4bdcbf7a51eae2e8ad919dcb5f92abebcb3ea)]:
  - @ts-pf/contract@0.2.1

## 0.1.6

### Patch Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only. READMEs that did not name every symbol in their skill's `## API` section gain a matching `API` list (`check:skills` now asserts it), and every fenced `ts` block in READMEs and skills now type-checks against `dist` (`check:snippets`): missing `procedure` / `z` / `catalog` / `spawn` / `FetchHandler` imports were added, Node-resolved relative imports carry `.js`, the server skill implements the whole example contract, and prose fragments are marked `no-check`.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb) Thanks [@crobinson42](https://github.com/crobinson42)! - Declare `engines.node >=22` and ship the MIT `LICENSE` file in the tarball.

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

- Updated dependencies [[`f84277c`](https://github.com/crobinson42/ts-pf/commit/f84277c2d165088bc18fa1b8d4e795d46d836764), [`23f457e`](https://github.com/crobinson42/ts-pf/commit/23f457e4e47d5f39506034272b22c35417f11618), [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5), [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb), [`53aaa5a`](https://github.com/crobinson42/ts-pf/commit/53aaa5a33ffee876b237ef6a85744c99cd4aa7d1), [`3268bc4`](https://github.com/crobinson42/ts-pf/commit/3268bc4b3cb5b94ceb8e8cb6473b0d7785911b8d)]:
  - @ts-pf/contract@0.2.0

## 0.1.5

### Patch Changes

- Updated dependencies [276aa9e]
  - @ts-pf/contract@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies [8cf3711]
  - @ts-pf/contract@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [615fd9c]
  - @ts-pf/contract@0.1.3

## 0.1.2

### Patch Changes

- 92c5262: Point package `exports` at `dist`. npm does not rewrite `publishConfig.exports`, so published tarballs previously resolved to missing `src/` files.
- Updated dependencies [92c5262]
  - @ts-pf/contract@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [1070bfa]
  - @ts-pf/contract@0.1.1

## 0.1.0

### Patch Changes

- First stable `0.1.0` release. Exit Changesets pre mode and publish to the npm `latest` dist-tag.
- Updated dependencies
  - @ts-pf/contract@0.1.0

## 0.1.0-beta.2

### Patch Changes

- e85f033: Add npm `keywords` on every published package so the family is discoverable (typescript, rpc, typesafe, contract-first) with per-package terms for the pipe or adapter.
- Updated dependencies [e85f033]
  - @ts-pf/contract@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- Publish from GitHub Actions with npm trusted publishing (OIDC). No `NPM_TOKEN`.
- Updated dependencies
  - @ts-pf/contract@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 5ffff32: First public beta of the `@ts-pf` packages. Contract-first TypeScript RPC: one procedure model, Fetch and message adapters, and opt-in file, stream, SSE, docs, OpenAPI, codegen, SWR, and mvc-kit packages.

### Patch Changes

- 5ffff32: Ship a consumer agent skill with each package (`skills/ts-pf-<name>/SKILL.md`, plus hub `ts-pf-app` on `@ts-pf/contract`). After install or `npm update`: `npx skills experimental_sync -y`. Skills version with the package. Do not put this on a library `postinstall`.
- acb661d: Add `@ts-pf/mvc-kit` with `bindClient` (inject `disposeSignal` on a `ContractClient`) and `issuesToFieldErrors` (VALIDATION issues → `FormModel.setErrors`). Peer `mvc-kit >= 4.9.0`. Does not wrap Resource or React hooks.
- Updated dependencies [5ffff32]
- Updated dependencies [5ffff32]
  - @ts-pf/contract@0.1.0-beta.0
