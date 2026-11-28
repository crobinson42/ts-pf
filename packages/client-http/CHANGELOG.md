# @ts-pf/client-http

## 1.0.2

### Patch Changes

- Updated dependencies []:
  - @ts-pf/client@1.0.2
  - @ts-pf/http@1.0.2
  - @ts-pf/protocol@1.0.2

## 1.0.1

### Patch Changes

- Updated dependencies []:
  - @ts-pf/client@1.0.1
  - @ts-pf/http@1.0.1
  - @ts-pf/protocol@1.0.1

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
  - @ts-pf/client@1.0.0
  - @ts-pf/http@1.0.0
  - @ts-pf/protocol@1.0.0

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @ts-pf/client@0.7.0
  - @ts-pf/http@0.7.0
  - @ts-pf/protocol@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies []:
  - @ts-pf/client@0.6.1
  - @ts-pf/http@0.6.1
  - @ts-pf/protocol@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @ts-pf/client@0.6.0
  - @ts-pf/http@0.6.0
  - @ts-pf/protocol@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @ts-pf/client@0.5.2
  - @ts-pf/http@0.5.2
  - @ts-pf/protocol@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies [[`6fca318`](https://github.com/crobinson42/ts-pf/commit/6fca3182b414f0223dd7d58b2d8f97f048692ce2)]:
  - @ts-pf/protocol@0.5.1
  - @ts-pf/client@0.5.1
  - @ts-pf/http@0.5.1

## 0.5.0

### Patch Changes

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798) Thanks [@crobinson42](https://github.com/crobinson42)! - Every published `@ts-pf/*` package now releases together on one version (a Changesets `fixed` group), starting with this release; that is why this package's version jumps. Keep all `@ts-pf/*` dependencies on the same version and update them together in one install command: internal dependencies are exact pins, so a mixed set installs duplicate copies of shared packages such as `@ts-pf/protocol`.

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`26d42ca`](https://github.com/crobinson42/ts-pf/commit/26d42ca895f73451d81f6198f659acf8fcb0e7ee) Thanks [@crobinson42](https://github.com/crobinson42)! - `isPFError` now recognises a `PFError` from another installed copy of `@ts-pf/protocol` (version skew, or a bundler that inlined one). Before, such an error failed the check, so `toWireError` sent a typed failure as `INTERNAL` and `FetchLink` wrapped one thrown by a Fetch interceptor as a local failure. `PFError.prototype` carries a non-enumerable `Symbol.for('ts-pf.PFError')` brand; instances gain no own property. `FetchLink` and `bindClient` use the same check.
- Updated dependencies [[`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798), [`26d42ca`](https://github.com/crobinson42/ts-pf/commit/26d42ca895f73451d81f6198f659acf8fcb0e7ee), [`a603b5c`](https://github.com/crobinson42/ts-pf/commit/a603b5cfec1d52d385d5fa7eab098d9415cb90dd), [`d772f61`](https://github.com/crobinson42/ts-pf/commit/d772f61b4c8c27b134c3f7185498bb94964d8b3e), [`675edb7`](https://github.com/crobinson42/ts-pf/commit/675edb75df8e400dfc70474b60989b59ff464375), [`e32afd5`](https://github.com/crobinson42/ts-pf/commit/e32afd5c369fea7e9e3b2a7b772546ab134df26c)]:
  - @ts-pf/client@0.5.0
  - @ts-pf/http@0.5.0
  - @ts-pf/protocol@0.5.0

## 0.2.4

### Patch Changes

- Updated dependencies []:
  - @ts-pf/client@0.2.4

## 0.2.3

### Patch Changes

- [#32](https://github.com/crobinson42/ts-pf/pull/32) [`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only, no API or wire change. The `ts-pf-server-http` skill gains "Cacheable reads and public REST (userland)": a smoke-tested GET bridge (`HandlerPlugin` + Fetch `Interceptor`, in `examples/plugins`) that serves opted-in reads as `GET {prefix}/{path}?input=<JSON>` with `Cache-Control`, plus a REST facade over `createLocalClient`. The `ts-pf-openapi` skill shows how to add the bridge's `get` operations to the generated document; `ts-pf-client-http`, `ts-pf-docs`, and the `ts-pf-app` hub point at it; `PROTOCOL.md` notes that such a bridge sits outside the v1 wire.
- Updated dependencies [[`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3)]:
  - @ts-pf/protocol@0.2.2
  - @ts-pf/client@0.2.3
  - @ts-pf/http@0.2.2

## 0.2.2

### Patch Changes

- [#26](https://github.com/crobinson42/ts-pf/pull/26) [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01) Thanks [@crobinson42](https://github.com/crobinson42)! - Quote consumer skill `description` front matter so `npx skills experimental_sync` can install the skills. An unquoted `Triggers:` is invalid YAML, and the installer skipped every published skill.
- Updated dependencies [[`491a8c1`](https://github.com/crobinson42/ts-pf/commit/491a8c1146309caf305c8bc62c874e3a7aba3a05), [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01)]:
  - @ts-pf/client@0.2.2
  - @ts-pf/http@0.2.1
  - @ts-pf/protocol@0.2.1

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @ts-pf/client@0.2.1

## 0.2.0

### Minor Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`fb03a52`](https://github.com/crobinson42/ts-pf/commit/fb03a52ac4e8d520cd6b30c24331af8069de9cd5) Thanks [@crobinson42](https://github.com/crobinson42)! - `FetchLink` now checks the response `x-ts-pf-protocol` header before decoding. When the header is present and not `1` (surrounding whitespace ignored), the body is not read and the call rejects with a `PFError` shaped like the existing non-RPC decode failure: `code: 'INTERNAL'`, `status` = the HTTP response status, message `Unsupported protocol version (x-ts-pf-protocol: <value>)`, `cause` = the `Response`. It is not a local failure (`isLocalFailure` is false — the response demonstrably came from a server), so `RetryPlugin`'s default predicate does not retry it. Responses without the header are unchanged (decode; a decode failure is still `INTERNAL` + HTTP status + `Non-RPC response (HTTP …)`), and responses with `x-ts-pf-protocol: 1` are unchanged (decode; codec `PFError`s are rethrown). The request header `FetchLink` sends is unchanged (`x-ts-pf-protocol: 1`).

### Patch Changes

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

- Updated dependencies [[`d3498b5`](https://github.com/crobinson42/ts-pf/commit/d3498b57ed2d48b159b80f3c952e33a5824af77c), [`f75393d`](https://github.com/crobinson42/ts-pf/commit/f75393d25ee6e1cfc4473b2a06fe50921d423d4c), [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5), [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb), [`053fd11`](https://github.com/crobinson42/ts-pf/commit/053fd11533e4897a3e63a81478cbc7b89182fdd2), [`5fde308`](https://github.com/crobinson42/ts-pf/commit/5fde308064b37da76e3faaf688a0d4a734d1240d), [`5e5a998`](https://github.com/crobinson42/ts-pf/commit/5e5a99848231e36d8bfa1ef57db9169aee6d9750), [`fb03a52`](https://github.com/crobinson42/ts-pf/commit/fb03a52ac4e8d520cd6b30c24331af8069de9cd5), [`025c1c4`](https://github.com/crobinson42/ts-pf/commit/025c1c47ca5ec7484e2c3d388278c5fe8380c6e6), [`53aaa5a`](https://github.com/crobinson42/ts-pf/commit/53aaa5a33ffee876b237ef6a85744c99cd4aa7d1), [`3268bc4`](https://github.com/crobinson42/ts-pf/commit/3268bc4b3cb5b94ceb8e8cb6473b0d7785911b8d), [`025c1c4`](https://github.com/crobinson42/ts-pf/commit/025c1c47ca5ec7484e2c3d388278c5fe8380c6e6)]:
  - @ts-pf/client@0.2.0
  - @ts-pf/http@0.2.0
  - @ts-pf/protocol@0.2.0

## 0.1.5

### Patch Changes

- @ts-pf/client@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies [8cf3711]
  - @ts-pf/protocol@0.1.2
  - @ts-pf/client@0.1.4
  - @ts-pf/http@0.1.2

## 0.1.3

### Patch Changes

- @ts-pf/client@0.1.3

## 0.1.2

### Patch Changes

- 92c5262: Point package `exports` at `dist`. npm does not rewrite `publishConfig.exports`, so published tarballs previously resolved to missing `src/` files.
- Updated dependencies [92c5262]
  - @ts-pf/client@0.1.2
  - @ts-pf/http@0.1.1
  - @ts-pf/protocol@0.1.1

## 0.1.1

### Patch Changes

- @ts-pf/client@0.1.1

## 0.1.0

### Patch Changes

- First stable `0.1.0` release. Exit Changesets pre mode and publish to the npm `latest` dist-tag.
- Updated dependencies
  - @ts-pf/client@0.1.0
  - @ts-pf/http@0.1.0
  - @ts-pf/protocol@0.1.0

## 0.1.0-beta.2

### Patch Changes

- e85f033: Add npm `keywords` on every published package so the family is discoverable (typescript, rpc, typesafe, contract-first) with per-package terms for the pipe or adapter.
- Updated dependencies [e85f033]
  - @ts-pf/client@0.1.0-beta.2
  - @ts-pf/http@0.1.0-beta.2
  - @ts-pf/protocol@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- Publish from GitHub Actions with npm trusted publishing (OIDC). No `NPM_TOKEN`.
- Updated dependencies
  - @ts-pf/client@0.1.0-beta.1
  - @ts-pf/http@0.1.0-beta.1
  - @ts-pf/protocol@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 5ffff32: First public beta of the `@ts-pf` packages. Contract-first TypeScript RPC: one procedure model, Fetch and message adapters, and opt-in file, stream, SSE, docs, OpenAPI, codegen, SWR, and mvc-kit packages.

### Patch Changes

- 5ffff32: Ship a consumer agent skill with each package (`skills/ts-pf-<name>/SKILL.md`, plus hub `ts-pf-app` on `@ts-pf/contract`). After install or `npm update`: `npx skills experimental_sync -y`. Skills version with the package. Do not put this on a library `postinstall`.
- Updated dependencies [5ffff32]
- Updated dependencies [5ffff32]
  - @ts-pf/client@0.1.0-beta.0
  - @ts-pf/http@0.1.0-beta.0
  - @ts-pf/protocol@0.1.0-beta.0
