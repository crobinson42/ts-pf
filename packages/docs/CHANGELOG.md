# @ts-pf/docs

## 0.1.11

### Patch Changes

- [#32](https://github.com/crobinson42/ts-pf/pull/32) [`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only, no API or wire change. The `ts-pf-server-http` skill gains "Cacheable reads and public REST (userland)": a smoke-tested GET bridge (`HandlerPlugin` + Fetch `Interceptor`, in `examples/plugins`) that serves opted-in reads as `GET {prefix}/{path}?input=<JSON>` with `Cache-Control`, plus a REST facade over `createLocalClient`. The `ts-pf-openapi` skill shows how to add the bridge's `get` operations to the generated document; `ts-pf-client-http`, `ts-pf-docs`, and the `ts-pf-app` hub point at it; `PROTOCOL.md` notes that such a bridge sits outside the v1 wire.
- Updated dependencies [[`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3)]:
  - @ts-pf/contract@0.2.3
  - @ts-pf/protocol@0.2.2
  - @ts-pf/http@0.2.2

## 0.1.10

### Patch Changes

- [#26](https://github.com/crobinson42/ts-pf/pull/26) [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01) Thanks [@crobinson42](https://github.com/crobinson42)! - Quote consumer skill `description` front matter so `npx skills experimental_sync` can install the skills. An unquoted `Triggers:` is invalid YAML, and the installer skipped every published skill.
- Updated dependencies [[`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01)]:
  - @ts-pf/contract@0.2.2
  - @ts-pf/http@0.2.1
  - @ts-pf/protocol@0.2.1

## 0.1.9

### Patch Changes

- [#22](https://github.com/crobinson42/ts-pf/pull/22) [`c47e72c`](https://github.com/crobinson42/ts-pf/commit/c47e72c54411099bd21b5c7e2ade943cf162086b) Thanks [@crobinson42](https://github.com/crobinson42)! - `docs()` keeps `tags` and `hidden` as literal types in its return type (other fields stay `DocsMeta`), so `@ts-pf/mcp` can filter on them in types. Runtime output is unchanged.

## 0.1.8

### Patch Changes

- Updated dependencies [[`a2b4bdc`](https://github.com/crobinson42/ts-pf/commit/a2b4bdcbf7a51eae2e8ad919dcb5f92abebcb3ea)]:
  - @ts-pf/contract@0.2.1

## 0.1.7

### Patch Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only. READMEs that did not name every symbol in their skill's `## API` section gain a matching `API` list (`check:skills` now asserts it), and every fenced `ts` block in READMEs and skills now type-checks against `dist` (`check:snippets`): missing `procedure` / `z` / `catalog` / `spawn` / `FetchHandler` imports were added, Node-resolved relative imports carry `.js`, the server skill implements the whole example contract, and prose fragments are marked `no-check`.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`601664f`](https://github.com/crobinson42/ts-pf/commit/601664f0ac3a1a81c36964b44cc26b25640e8c58) Thanks [@crobinson42](https://github.com/crobinson42)! - Remove the unused `@standard-schema/spec` dependency. No source file imported it.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`23f457e`](https://github.com/crobinson42/ts-pf/commit/23f457e4e47d5f39506034272b22c35417f11618) Thanks [@crobinson42](https://github.com/crobinson42)! - Derive the catalog `protocolErrors` codes and HTTP statuses from `ProtocolErrorCode` and `PROTOCOL_HTTP_STATUS` instead of a hand-copied table. Output is unchanged.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb) Thanks [@crobinson42](https://github.com/crobinson42)! - Declare `engines.node >=22` and ship the MIT `LICENSE` file in the tarball.

- Updated dependencies [[`f84277c`](https://github.com/crobinson42/ts-pf/commit/f84277c2d165088bc18fa1b8d4e795d46d836764), [`23f457e`](https://github.com/crobinson42/ts-pf/commit/23f457e4e47d5f39506034272b22c35417f11618), [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5), [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb), [`053fd11`](https://github.com/crobinson42/ts-pf/commit/053fd11533e4897a3e63a81478cbc7b89182fdd2), [`5fde308`](https://github.com/crobinson42/ts-pf/commit/5fde308064b37da76e3faaf688a0d4a734d1240d), [`5e5a998`](https://github.com/crobinson42/ts-pf/commit/5e5a99848231e36d8bfa1ef57db9169aee6d9750), [`fb03a52`](https://github.com/crobinson42/ts-pf/commit/fb03a52ac4e8d520cd6b30c24331af8069de9cd5), [`025c1c4`](https://github.com/crobinson42/ts-pf/commit/025c1c47ca5ec7484e2c3d388278c5fe8380c6e6), [`53aaa5a`](https://github.com/crobinson42/ts-pf/commit/53aaa5a33ffee876b237ef6a85744c99cd4aa7d1), [`3268bc4`](https://github.com/crobinson42/ts-pf/commit/3268bc4b3cb5b94ceb8e8cb6473b0d7785911b8d)]:
  - @ts-pf/contract@0.2.0
  - @ts-pf/http@0.2.0
  - @ts-pf/protocol@0.2.0

## 0.1.6

### Patch Changes

- Updated dependencies [276aa9e]
  - @ts-pf/contract@0.1.5

## 0.1.5

### Patch Changes

- Updated dependencies [8cf3711]
  - @ts-pf/protocol@0.1.2
  - @ts-pf/contract@0.1.4
  - @ts-pf/http@0.1.2

## 0.1.4

### Patch Changes

- Updated dependencies [615fd9c]
  - @ts-pf/contract@0.1.3

## 0.1.3

### Patch Changes

- 92c5262: Point package `exports` at `dist`. npm does not rewrite `publishConfig.exports`, so published tarballs previously resolved to missing `src/` files.
- Updated dependencies [92c5262]
  - @ts-pf/contract@0.1.2
  - @ts-pf/http@0.1.1
  - @ts-pf/protocol@0.1.1

## 0.1.2

### Patch Changes

- be734b4: Stress-test input/output JSON Schema through `catalog()` → `emit()` / `openapi()`. Hoist OpenAPI inner schemas so recursive `$ref`s resolve, print TypeBox records and catchall index signatures as valid TypeScript, and treat non-JSON TypeBox `type`s as unavailable.

## 0.1.1

### Patch Changes

- Updated dependencies [1070bfa]
  - @ts-pf/contract@0.1.1

## 0.1.0

### Patch Changes

- First stable `0.1.0` release. Exit Changesets pre mode and publish to the npm `latest` dist-tag.
- Updated dependencies
  - @ts-pf/contract@0.1.0
  - @ts-pf/http@0.1.0
  - @ts-pf/protocol@0.1.0

## 0.1.0-beta.2

### Patch Changes

- e85f033: Add npm `keywords` on every published package so the family is discoverable (typescript, rpc, typesafe, contract-first) with per-package terms for the pipe or adapter.
- Updated dependencies [e85f033]
  - @ts-pf/contract@0.1.0-beta.2
  - @ts-pf/http@0.1.0-beta.2
  - @ts-pf/protocol@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- Publish from GitHub Actions with npm trusted publishing (OIDC). No `NPM_TOKEN`.
- Updated dependencies
  - @ts-pf/contract@0.1.0-beta.1
  - @ts-pf/http@0.1.0-beta.1
  - @ts-pf/protocol@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 5ffff32: First public beta of the `@ts-pf` packages. Contract-first TypeScript RPC: one procedure model, Fetch and message adapters, and opt-in file, stream, SSE, docs, OpenAPI, codegen, SWR, and mvc-kit packages.

### Patch Changes

- 5ffff32: Ship a consumer agent skill with each package (`skills/ts-pf-<name>/SKILL.md`, plus hub `ts-pf-app` on `@ts-pf/contract`). After install or `npm update`: `npx skills experimental_sync -y`. Skills version with the package. Do not put this on a library `postinstall`.
- 9baec2e: Add `@ts-pf/codegen` to print a nested `Contract` `.d.ts` from `catalog()` for split-repo `createClient<Contract>`. Catalog docs cover OpenAPI and codegen projections; OpenAPI README points typed clients at codegen; SWR notes generated `Contract` works with `createSwr`.
- 9baec2e: Add `@ts-pf/openapi` to project `catalog()` into RPC-shaped OpenAPI 3.1. Catalog stream entries include item schemas; protocol `VALIDATION` includes its data schema.
- Updated dependencies [5ffff32]
- Updated dependencies [5ffff32]
  - @ts-pf/contract@0.1.0-beta.0
  - @ts-pf/http@0.1.0-beta.0
  - @ts-pf/protocol@0.1.0-beta.0
