# @ts-pf/codegen

## 1.0.2

### Patch Changes

- Updated dependencies []:
  - @ts-pf/docs@1.0.2

## 1.0.1

### Patch Changes

- Updated dependencies []:
  - @ts-pf/docs@1.0.1

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
  - @ts-pf/docs@1.0.0

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @ts-pf/docs@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies []:
  - @ts-pf/docs@0.6.1

## 0.6.0

### Minor Changes

- [#66](https://github.com/crobinson42/ts-pf/pull/66) [`eeff84e`](https://github.com/crobinson42/ts-pf/commit/eeff84e41a400aed328b5f791bd706d06c407fa1) Thanks [@crobinson42](https://github.com/crobinson42)! - Expandable outputs. `procedure.input(I).output(Wide).expand({ key: 'populate', at?: ['docs'], fields: { authorId: User } })` makes a procedure's output type follow a list in its input. `client.posts.get({ id, populate: ['authorId'] })` returns `authorId` as `User`; without the list it is the plain id type. This works on every client (`createClient`, `createLocalClient`, swr, mvc-kit, astro, and codegen output) with no wrapper. `.output()` stays the wide schema, so the wire and the server do not change.
  
  - `@ts-pf/contract`: `.expand()`, the `Expansion<Key, At, Fields>` type (the hand-writable 6th `ContractProcedure` parameter; `Fields` are output types), `InferExpandedOutput<T, P>`, and `ContractExpandDef`. `InferContractProcedure` gains `expand`, and `ProcedureClient` gains an optional 4th parameter.
  - `@ts-pf/swr`: the callable and `.call` narrow. `key` / `fetcher` / `mutator` stay wide; annotate those with `InferExpandedOutput`.
  - `@ts-pf/docs`: `CatalogProcedure.expand` (`CatalogExpand`).
  - `@ts-pf/codegen`: `emit` / `emitFiles` print the `Expansion` argument. `diffCatalog` reports `expand-*` changes (a removal is breaking; an addition is safe).
  - `@ts-pf/openapi`: `x-ts-pf-expand: { key, at, fields }` on the operation.

### Patch Changes

- Updated dependencies [[`eeff84e`](https://github.com/crobinson42/ts-pf/commit/eeff84e41a400aed328b5f791bd706d06c407fa1)]:
  - @ts-pf/docs@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @ts-pf/docs@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @ts-pf/docs@0.5.1

## 0.5.0

### Minor Changes

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`c9df62d`](https://github.com/crobinson42/ts-pf/commit/c9df62d5a3cac4db7e0f68c17c139b04935e1f9e) Thanks [@crobinson42](https://github.com/crobinson42)! - Add `diffCatalog(previous, next)` and `ts-pf-codegen diff <previous.json> <next.json> [--json]`: a breaking-change check over two `catalog()` documents. Inputs are compared as what old clients send; outputs and error `data` as what they receive. Adding an output field, enum value, union variant, or error code is safe. `diff` exits 2 when there is a breaking change, so CI can fail on it. New exports: `diffCatalog`, `CatalogDiff`, `CatalogChange`.

### Patch Changes

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`29c8fac`](https://github.com/crobinson42/ts-pf/commit/29c8fac45a3be7a01eaffd2a490671190e6d6516) Thanks [@crobinson42](https://github.com/crobinson42)! - `@ts-pf/docs` exports `canonicalize(value)`, a copy of a JSON value with every object's keys sorted, so `JSON.stringify` of the result is byte-stable. `catalogHash()` in `@ts-pf/codegen` now hashes `canonicalize(catalog)` from `@ts-pf/docs` instead of a private copy; hash values are unchanged.

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798) Thanks [@crobinson42](https://github.com/crobinson42)! - Every published `@ts-pf/*` package now releases together on one version (a Changesets `fixed` group), starting with this release; that is why this package's version jumps. Keep all `@ts-pf/*` dependencies on the same version and update them together in one install command: internal dependencies are exact pins, so a mixed set installs duplicate copies of shared packages such as `@ts-pf/protocol`.
- Updated dependencies [[`29c8fac`](https://github.com/crobinson42/ts-pf/commit/29c8fac45a3be7a01eaffd2a490671190e6d6516), [`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798), [`09140cd`](https://github.com/crobinson42/ts-pf/commit/09140cd8c927d04953479f9f56f3449b3a30459c), [`4c7ba42`](https://github.com/crobinson42/ts-pf/commit/4c7ba42a4b64aa44ac3ddc86ca9858d100c74784)]:
  - @ts-pf/docs@0.5.0

## 0.2.2

### Patch Changes

- Updated dependencies []:
  - @ts-pf/docs@0.1.12

## 0.2.1

### Patch Changes

- [#38](https://github.com/crobinson42/ts-pf/pull/38) [`de71625`](https://github.com/crobinson42/ts-pf/commit/de7162505007b33c10156632a2f0d372427badb1) Thanks [@crobinson42](https://github.com/crobinson42)! - emitFiles headers name each file's role, contract path, and client call or parent file so a large generated directory can be navigated from the first lines. The catalog hash stays on the entry.

## 0.2.0

### Minor Changes

- [#36](https://github.com/crobinson42/ts-pf/pull/36) [`8189a8f`](https://github.com/crobinson42/ts-pf/commit/8189a8fa591b1e92e9cc4d72a160865e7a36c261) Thanks [@crobinson42](https://github.com/crobinson42)! - Add `emitFiles()` and `ts-pf-codegen --out-dir` so a large catalog can be printed as one entry `.d.ts` plus a file per group and procedure, instead of a single inlined `Contract`. `_phantom.d.ts` is included only when some error has data.

## 0.1.12

### Patch Changes

- Updated dependencies [[`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3)]:
  - @ts-pf/docs@0.1.11

## 0.1.11

### Patch Changes

- [#26](https://github.com/crobinson42/ts-pf/pull/26) [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01) Thanks [@crobinson42](https://github.com/crobinson42)! - Quote consumer skill `description` front matter so `npx skills experimental_sync` can install the skills. An unquoted `Triggers:` is invalid YAML, and the installer skipped every published skill.
- Updated dependencies [[`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01)]:
  - @ts-pf/docs@0.1.10

## 0.1.10

### Patch Changes

- Updated dependencies [[`c47e72c`](https://github.com/crobinson42/ts-pf/commit/c47e72c54411099bd21b5c7e2ade943cf162086b)]:
  - @ts-pf/docs@0.1.9

## 0.1.9

### Patch Changes

- Updated dependencies []:
  - @ts-pf/docs@0.1.8

## 0.1.8

### Patch Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`e50073f`](https://github.com/crobinson42/ts-pf/commit/e50073faed33ee33e2000f31553d8406cbe615e7) Thanks [@crobinson42](https://github.com/crobinson42)! - Fix the `ts-pf-codegen` bin being a silent no-op under `npx` and npm scripts. `isMain()` compared the module's real path with the `node_modules/.bin` symlink path, so the entry never ran; both sides now go through `realpathSync`. Add `--help` / `-h`, which print usage to stdout and exit 0.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only. READMEs that did not name every symbol in their skill's `## API` section gain a matching `API` list (`check:skills` now asserts it), and every fenced `ts` block in READMEs and skills now type-checks against `dist` (`check:snippets`): missing `procedure` / `z` / `catalog` / `spawn` / `FetchHandler` imports were added, Node-resolved relative imports carry `.js`, the server skill implements the whole example contract, and prose fragments are marked `no-check`.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`286e2c1`](https://github.com/crobinson42/ts-pf/commit/286e2c13cae5618204a095df7c5a5128a0b9c13a) Thanks [@crobinson42](https://github.com/crobinson42)! - Internal: symbols used only inside their own module are no longer `export`ed (`sanitizeSegment`, `OpenAPIServer`, `OpenAPIMediaType`, `OpenAPIResponseHeader`, `OpenAPIParameter`, `OpenAPIRef`, `SseEvent`, `DeepPartial`, `PrintResult`, `ProcNode`, `NsNode`). None were reachable from the package entry points, so the public API is unchanged.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb) Thanks [@crobinson42](https://github.com/crobinson42)! - Declare `engines.node >=22` and ship the MIT `LICENSE` file in the tarball.

- Updated dependencies [[`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5), [`601664f`](https://github.com/crobinson42/ts-pf/commit/601664f0ac3a1a81c36964b44cc26b25640e8c58), [`23f457e`](https://github.com/crobinson42/ts-pf/commit/23f457e4e47d5f39506034272b22c35417f11618), [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb)]:
  - @ts-pf/docs@0.1.7

## 0.1.7

### Patch Changes

- @ts-pf/docs@0.1.6

## 0.1.6

### Patch Changes

- @ts-pf/docs@0.1.5

## 0.1.5

### Patch Changes

- @ts-pf/docs@0.1.4

## 0.1.4

### Patch Changes

- 92c5262: Point package `exports` at `dist`. npm does not rewrite `publishConfig.exports`, so published tarballs previously resolved to missing `src/` files.
- Updated dependencies [92c5262]
  - @ts-pf/docs@0.1.3

## 0.1.3

### Patch Changes

- 35e5895: Point at `examples/codegen` for the split-repo `emit` / `createClient<Contract>` happy path.
- be734b4: Stress-test input/output JSON Schema through `catalog()` → `emit()` / `openapi()`. Hoist OpenAPI inner schemas so recursive `$ref`s resolve, print TypeBox records and catchall index signatures as valid TypeScript, and treat non-JSON TypeBox `type`s as unavailable.
- Updated dependencies [be734b4]
  - @ts-pf/docs@0.1.2

## 0.1.2

### Patch Changes

- bb2485b: `emit()` prints JSDoc from catalog `docs()` (`description`, `summary`, `@deprecated`) onto generated `Contract` members. Other `.meta()` stays on the catalog.

## 0.1.1

### Patch Changes

- @ts-pf/docs@0.1.1

## 0.1.0

### Patch Changes

- First stable `0.1.0` release. Exit Changesets pre mode and publish to the npm `latest` dist-tag.
- Updated dependencies
  - @ts-pf/docs@0.1.0

## 0.1.0-beta.2

### Patch Changes

- e85f033: Add npm `keywords` on every published package so the family is discoverable (typescript, rpc, typesafe, contract-first) with per-package terms for the pipe or adapter.
- Updated dependencies [e85f033]
  - @ts-pf/docs@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- Publish from GitHub Actions with npm trusted publishing (OIDC). No `NPM_TOKEN`.
- Updated dependencies
  - @ts-pf/docs@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 5ffff32: First public beta of the `@ts-pf` packages. Contract-first TypeScript RPC: one procedure model, Fetch and message adapters, and opt-in file, stream, SSE, docs, OpenAPI, codegen, SWR, and mvc-kit packages.

### Patch Changes

- 5ffff32: Ship a consumer agent skill with each package (`skills/ts-pf-<name>/SKILL.md`, plus hub `ts-pf-app` on `@ts-pf/contract`). After install or `npm update`: `npx skills experimental_sync -y`. Skills version with the package. Do not put this on a library `postinstall`.
- 9baec2e: Add `@ts-pf/codegen` to print a nested `Contract` `.d.ts` from `catalog()` for split-repo `createClient<Contract>`. Catalog docs cover OpenAPI and codegen projections; OpenAPI README points typed clients at codegen; SWR notes generated `Contract` works with `createSwr`.
- Updated dependencies [5ffff32]
- Updated dependencies [9baec2e]
- Updated dependencies [5ffff32]
- Updated dependencies [9baec2e]
  - @ts-pf/docs@0.1.0-beta.0
