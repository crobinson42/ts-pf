# @ts-pf/openapi

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

- [#61](https://github.com/crobinson42/ts-pf/pull/61) [`6fca318`](https://github.com/crobinson42/ts-pf/commit/6fca3182b414f0223dd7d58b2d8f97f048692ce2) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs: link the new "Clients in other languages" guide from `PROTOCOL.md`, the conformance fixtures README, the protocol and openapi READMEs, the protocol and openapi skills, and the `ts-pf-app` hub skill. The fixtures README gains a "Getting the files" section with version-pinned jsDelivr / unpkg URLs, and the openapi README says to generate models only (the call layer classifies by envelope, not HTTP status).
- Updated dependencies []:
  - @ts-pf/docs@0.5.1

## 0.5.0

### Minor Changes

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`8c065e8`](https://github.com/crobinson42/ts-pf/commit/8c065e82ef8aa1a2a99c4c90b8fadc6478be10a6) Thanks [@crobinson42](https://github.com/crobinson42)! - Complete the codegen profile. `profile: 'codegen'` now also sets:
  
  - `hoist: 'objects'`: nested inline objects with properties become named components (`BookFindOutputAuthor`; array items `…Item`, record values `…Value`, union variants by tag value). Identical shapes share one component. Protocol envelopes keep their inline objects. A warning lists the made-up names, so you can give those objects a `.meta({ id })`.
  - `discriminators: true`: `discriminator: { propertyName, mapping }` on unions of components that each require a different string tag.
  - `canonical: true`: keys sorted at every depth, using `canonicalize` from `@ts-pf/docs`, so output is byte-stable.
  
  New options the profile never sets:
  
  - `streams: 'operation' | 'components' | 'omit'`. `'components'` gives stream procedures no path and lists their schemas in a document-level `x-ts-pf-streams` map, for streams served over message transports. `'omit'` leaves them out.
  - `enumNames`: names shared inline enums by value set (`{ BookStatus: ['available', 'loaned'] }`).
  - `catalogHash`: written to `info['x-ts-pf-catalog-hash']`. Pass `catalogHash(catalog)` from `@ts-pf/codegen`.
  
  The default output is unchanged.

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`0a62f9a`](https://github.com/crobinson42/ts-pf/commit/0a62f9ae40991fbb6c81997e3024c90b567c4fb3) Thanks [@crobinson42](https://github.com/crobinson42)! - Add an opt-in codegen profile. `openapi(catalog, { profile: 'codegen', info })` makes the choices that code generators (openapi-generator, Kiota, orval, swagger_parser) need, and still describes the same POST JSON RPC paths and envelopes. The profile expands to options that can each be set alone. An option you pass yourself overrides the profile's value:
  
  - `envelopes: 'inline'`: request and success envelopes are inline in each operation instead of `<path>.Request` / `<path>.Success` components.
  - `errors: 'shared'`: one `RpcError` envelope, an `ErrorCode` enum, one `<Code>Data` per code with data (matched to `error.code` by name), and `x-ts-pf-errors` on each operation. Throws when one code has two `data` shapes.
  - `naming: 'pascal'`: `AuthVerifyCodeInput` instead of `auth.verifyCode.Input`. A procedure whose input or output is a `.meta({ id })` type uses the id. Throws when two schemas would get one name.
  - `closeInputs`, `constAsEnum: 'exceptTags'`, `dropFormatPatterns`, `emptyInputNull`.
  
  The default output is unchanged.

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`133ad37`](https://github.com/crobinson42/ts-pf/commit/133ad37a792d3191efbc91624e583c2525b7488f) Thanks [@crobinson42](https://github.com/crobinson42)! - The default `openapi()` output changes so code generators get one model per type. It still describes the same POST JSON RPC (same paths, envelopes, and operations), but component names and schema details differ:
  
  - Root `$defs` are hoisted: a `.meta({ id: 'Book' })` schema becomes `components.schemas.Book` and every `$ref` points there, so a DTO used by several procedures is one component instead of a copy under each `<path>.Input` / `<path>.Output`. Those per-procedure components remain; one that is just a named type is now a `$ref` to it. When an id's input and output shapes differ (for example a field with a default), the output keeps `Book` and the input is `BookInput`. Two different shapes for one id on the same side, an `<id>Input` that is already an id, or an id that equals another component name now throws, naming the id. Zod's unnamed recursive defs (`__schema0`, …) become `<host>.__schemaN`.
  - Declared errors are shared per code: when every procedure that declares a code has the same `data` shape (or none), operations reference one `Error.<CODE>` (and `Error.<CODE>.Data`) instead of `<path>.Error.<CODE>`. Codes whose data differs keep the per-procedure names.
  - Output and error `data` schemas (including the protocol `VALIDATION` data) no longer carry `additionalProperties: false`, so a server that adds a field does not break older generated clients. Input schemas and the protocol envelopes are unchanged.
  - Component schemas no longer carry a nested `$schema`; the document's `jsonSchemaDialect` declares the dialect.
  
  If you post-process the document by component name (for example `planet.find.Error.NOT_FOUND`, or `$defs` under a procedure's component), update it to the new names.

### Patch Changes

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798) Thanks [@crobinson42](https://github.com/crobinson42)! - Every published `@ts-pf/*` package now releases together on one version (a Changesets `fixed` group), starting with this release; that is why this package's version jumps. Keep all `@ts-pf/*` dependencies on the same version and update them together in one install command: internal dependencies are exact pins, so a mixed set installs duplicate copies of shared packages such as `@ts-pf/protocol`.
- Updated dependencies [[`29c8fac`](https://github.com/crobinson42/ts-pf/commit/29c8fac45a3be7a01eaffd2a490671190e6d6516), [`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798), [`09140cd`](https://github.com/crobinson42/ts-pf/commit/09140cd8c927d04953479f9f56f3449b3a30459c), [`4c7ba42`](https://github.com/crobinson42/ts-pf/commit/4c7ba42a4b64aa44ac3ddc86ca9858d100c74784)]:
  - @ts-pf/docs@0.5.0

## 0.1.12

### Patch Changes

- Updated dependencies []:
  - @ts-pf/docs@0.1.12

## 0.1.11

### Patch Changes

- [#32](https://github.com/crobinson42/ts-pf/pull/32) [`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only, no API or wire change. The `ts-pf-server-http` skill gains "Cacheable reads and public REST (userland)": a smoke-tested GET bridge (`HandlerPlugin` + Fetch `Interceptor`, in `examples/plugins`) that serves opted-in reads as `GET {prefix}/{path}?input=<JSON>` with `Cache-Control`, plus a REST facade over `createLocalClient`. The `ts-pf-openapi` skill shows how to add the bridge's `get` operations to the generated document; `ts-pf-client-http`, `ts-pf-docs`, and the `ts-pf-app` hub point at it; `PROTOCOL.md` notes that such a bridge sits outside the v1 wire.
- Updated dependencies [[`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3)]:
  - @ts-pf/docs@0.1.11

## 0.1.10

### Patch Changes

- [#26](https://github.com/crobinson42/ts-pf/pull/26) [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01) Thanks [@crobinson42](https://github.com/crobinson42)! - Quote consumer skill `description` front matter so `npx skills experimental_sync` can install the skills. An unquoted `Triggers:` is invalid YAML, and the installer skipped every published skill.
- Updated dependencies [[`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01)]:
  - @ts-pf/docs@0.1.10

## 0.1.9

### Patch Changes

- Updated dependencies [[`c47e72c`](https://github.com/crobinson42/ts-pf/commit/c47e72c54411099bd21b5c7e2ade943cf162086b)]:
  - @ts-pf/docs@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @ts-pf/docs@0.1.8

## 0.1.7

### Patch Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only. READMEs that did not name every symbol in their skill's `## API` section gain a matching `API` list (`check:skills` now asserts it), and every fenced `ts` block in READMEs and skills now type-checks against `dist` (`check:snippets`): missing `procedure` / `z` / `catalog` / `spawn` / `FetchHandler` imports were added, Node-resolved relative imports carry `.js`, the server skill implements the whole example contract, and prose fragments are marked `no-check`.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`286e2c1`](https://github.com/crobinson42/ts-pf/commit/286e2c13cae5618204a095df7c5a5128a0b9c13a) Thanks [@crobinson42](https://github.com/crobinson42)! - Internal: symbols used only inside their own module are no longer `export`ed (`sanitizeSegment`, `OpenAPIServer`, `OpenAPIMediaType`, `OpenAPIResponseHeader`, `OpenAPIParameter`, `OpenAPIRef`, `SseEvent`, `DeepPartial`, `PrintResult`, `ProcNode`, `NsNode`). None were reachable from the package entry points, so the public API is unchanged.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb) Thanks [@crobinson42](https://github.com/crobinson42)! - Declare `engines.node >=22` and ship the MIT `LICENSE` file in the tarball.

- Updated dependencies [[`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5), [`601664f`](https://github.com/crobinson42/ts-pf/commit/601664f0ac3a1a81c36964b44cc26b25640e8c58), [`23f457e`](https://github.com/crobinson42/ts-pf/commit/23f457e4e47d5f39506034272b22c35417f11618), [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb)]:
  - @ts-pf/docs@0.1.7

## 0.1.6

### Patch Changes

- @ts-pf/docs@0.1.6

## 0.1.5

### Patch Changes

- @ts-pf/docs@0.1.5

## 0.1.4

### Patch Changes

- @ts-pf/docs@0.1.4

## 0.1.3

### Patch Changes

- 92c5262: Point package `exports` at `dist`. npm does not rewrite `publishConfig.exports`, so published tarballs previously resolved to missing `src/` files.
- Updated dependencies [92c5262]
  - @ts-pf/docs@0.1.3

## 0.1.2

### Patch Changes

- be734b4: Stress-test input/output JSON Schema through `catalog()` → `emit()` / `openapi()`. Hoist OpenAPI inner schemas so recursive `$ref`s resolve, print TypeBox records and catchall index signatures as valid TypeScript, and treat non-JSON TypeBox `type`s as unavailable.
- Updated dependencies [be734b4]
  - @ts-pf/docs@0.1.2

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
- 9baec2e: Add `@ts-pf/openapi` to project `catalog()` into RPC-shaped OpenAPI 3.1. Catalog stream entries include item schemas; protocol `VALIDATION` includes its data schema.
- Updated dependencies [5ffff32]
- Updated dependencies [9baec2e]
- Updated dependencies [5ffff32]
- Updated dependencies [9baec2e]
  - @ts-pf/docs@0.1.0-beta.0
