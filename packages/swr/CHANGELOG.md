# @ts-pf/swr

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
  - @ts-pf/contract@0.6.0

## 0.5.2

### Patch Changes

- [#64](https://github.com/crobinson42/ts-pf/pull/64) [`13e63db`](https://github.com/crobinson42/ts-pf/commit/13e63db9186f9fd093c2f934dec2cabcd35beef3) Thanks [@crobinson42](https://github.com/crobinson42)! - Type client input with the input schema's input type, so a `.default()` field is optional at the call site (`client.posts.create({ title })`) and a `.transform()` input takes its source type. Handlers and `.useAfter()` still receive the parsed output type. `ContractProcedure` gains a fifth type parameter, `TParsedInput` (defaults to `TInput`, so hand-written and codegen `ContractProcedure<I, O>` types are unchanged), and `InferContractProcedure` returns `parsedInput` beside `input`. `stream(item)` input items follow the same split. `@ts-pf/swr` keys use the caller input type. Type-only: no runtime or wire change.
- Updated dependencies [[`13e63db`](https://github.com/crobinson42/ts-pf/commit/13e63db9186f9fd093c2f934dec2cabcd35beef3)]:
  - @ts-pf/contract@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies [[`6fca318`](https://github.com/crobinson42/ts-pf/commit/6fca3182b414f0223dd7d58b2d8f97f048692ce2)]:
  - @ts-pf/contract@0.5.1

## 0.5.0

### Patch Changes

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798) Thanks [@crobinson42](https://github.com/crobinson42)! - Every published `@ts-pf/*` package now releases together on one version (a Changesets `fixed` group), starting with this release; that is why this package's version jumps. Keep all `@ts-pf/*` dependencies on the same version and update them together in one install command: internal dependencies are exact pins, so a mixed set installs duplicate copies of shared packages such as `@ts-pf/protocol`.
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

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`286e2c1`](https://github.com/crobinson42/ts-pf/commit/286e2c13cae5618204a095df7c5a5128a0b9c13a) Thanks [@crobinson42](https://github.com/crobinson42)! - Internal: symbols used only inside their own module are no longer `export`ed (`sanitizeSegment`, `OpenAPIServer`, `OpenAPIMediaType`, `OpenAPIResponseHeader`, `OpenAPIParameter`, `OpenAPIRef`, `SseEvent`, `DeepPartial`, `PrintResult`, `ProcNode`, `NsNode`). None were reachable from the package entry points, so the public API is unchanged.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb) Thanks [@crobinson42](https://github.com/crobinson42)! - Declare `engines.node >=22` and ship the MIT `LICENSE` file in the tarball.

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
- 9baec2e: Add `@ts-pf/codegen` to print a nested `Contract` `.d.ts` from `catalog()` for split-repo `createClient<Contract>`. Catalog docs cover OpenAPI and codegen projections; OpenAPI README points typed clients at codegen; SWR notes generated `Contract` works with `createSwr`.
- Updated dependencies [5ffff32]
- Updated dependencies [5ffff32]
  - @ts-pf/contract@0.1.0-beta.0
