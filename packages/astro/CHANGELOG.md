# @ts-pf/astro

## 0.5.1

### Patch Changes

- Updated dependencies [[`6fca318`](https://github.com/crobinson42/ts-pf/commit/6fca3182b414f0223dd7d58b2d8f97f048692ce2)]:
  - @ts-pf/protocol@0.5.1
  - @ts-pf/contract@0.5.1
  - @ts-pf/client@0.5.1
  - @ts-pf/client-http@0.5.1
  - @ts-pf/server@0.5.1
  - @ts-pf/server-http@0.5.1

## 0.5.0

### Minor Changes

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`cef54db`](https://github.com/crobinson42/ts-pf/commit/cef54db72e74c4fcaaa1cae9eb7f73d23e20ba99) Thanks [@crobinson42](https://github.com/crobinson42)! - Raise the `astro` peer dependency floor from `>=4.9.0` to `>=7.0.0`, the major the package is built and tested against. Astro 4, 5, and 6 are no longer declared as supported. The README and `ts-pf-astro` skill state the new floor; the skill now says to declare the other `@ts-pf/*` packages the app imports on the same version as `@ts-pf/astro`, and adds a lint rule that keeps server-only and Node-only entry points out of island code.

### Patch Changes

- [#59](https://github.com/crobinson42/ts-pf/pull/59) [`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798) Thanks [@crobinson42](https://github.com/crobinson42)! - Every published `@ts-pf/*` package now releases together on one version (a Changesets `fixed` group), starting with this release; that is why this package's version jumps. Keep all `@ts-pf/*` dependencies on the same version and update them together in one install command: internal dependencies are exact pins, so a mixed set installs duplicate copies of shared packages such as `@ts-pf/protocol`.
- Updated dependencies [[`e81b871`](https://github.com/crobinson42/ts-pf/commit/e81b87125b359d488734273603bb313bdf00624a), [`d47d657`](https://github.com/crobinson42/ts-pf/commit/d47d65766943cbbc02411f27961e8da3f93d33a9), [`82fdd63`](https://github.com/crobinson42/ts-pf/commit/82fdd63d04e6732d96f8b792627bcaf69f569cf3), [`cdf1f66`](https://github.com/crobinson42/ts-pf/commit/cdf1f66d71cf7c0a726fc44743cc4e0411307798), [`26d42ca`](https://github.com/crobinson42/ts-pf/commit/26d42ca895f73451d81f6198f659acf8fcb0e7ee), [`a603b5c`](https://github.com/crobinson42/ts-pf/commit/a603b5cfec1d52d385d5fa7eab098d9415cb90dd), [`d772f61`](https://github.com/crobinson42/ts-pf/commit/d772f61b4c8c27b134c3f7185498bb94964d8b3e), [`09140cd`](https://github.com/crobinson42/ts-pf/commit/09140cd8c927d04953479f9f56f3449b3a30459c), [`c001422`](https://github.com/crobinson42/ts-pf/commit/c001422da0b1bc8d379cab560e4b83c19bf9fa60), [`675edb7`](https://github.com/crobinson42/ts-pf/commit/675edb75df8e400dfc70474b60989b59ff464375), [`e32afd5`](https://github.com/crobinson42/ts-pf/commit/e32afd5c369fea7e9e3b2a7b772546ab134df26c), [`7de78ce`](https://github.com/crobinson42/ts-pf/commit/7de78ce883a8e24801934ef7853f32850d0644ec)]:
  - @ts-pf/server@0.5.0
  - @ts-pf/contract@0.5.0
  - @ts-pf/client@0.5.0
  - @ts-pf/client-http@0.5.0
  - @ts-pf/protocol@0.5.0
  - @ts-pf/server-http@0.5.0

## 0.2.5

### Patch Changes

- Updated dependencies [[`44d5c83`](https://github.com/crobinson42/ts-pf/commit/44d5c8350d2370161fa092ee7725e860f0adbc2d)]:
  - @ts-pf/contract@0.2.4
  - @ts-pf/client@0.2.4
  - @ts-pf/client-http@0.2.4
  - @ts-pf/server@0.4.4
  - @ts-pf/server-http@0.3.5

## 0.2.4

### Patch Changes

- Updated dependencies [[`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3)]:
  - @ts-pf/server-http@0.3.4
  - @ts-pf/client-http@0.2.3
  - @ts-pf/contract@0.2.3
  - @ts-pf/protocol@0.2.2
  - @ts-pf/client@0.2.3
  - @ts-pf/server@0.4.3

## 0.2.3

### Patch Changes

- Updated dependencies [[`692515f`](https://github.com/crobinson42/ts-pf/commit/692515ff3e5179aca8df903cbc5e2eaae693a454)]:
  - @ts-pf/server-http@0.3.3

## 0.2.2

### Patch Changes

- [#26](https://github.com/crobinson42/ts-pf/pull/26) [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01) Thanks [@crobinson42](https://github.com/crobinson42)! - Quote consumer skill `description` front matter so `npx skills experimental_sync` can install the skills. An unquoted `Triggers:` is invalid YAML, and the installer skipped every published skill.
- Updated dependencies [[`491a8c1`](https://github.com/crobinson42/ts-pf/commit/491a8c1146309caf305c8bc62c874e3a7aba3a05), [`491a8c1`](https://github.com/crobinson42/ts-pf/commit/491a8c1146309caf305c8bc62c874e3a7aba3a05), [`491a8c1`](https://github.com/crobinson42/ts-pf/commit/491a8c1146309caf305c8bc62c874e3a7aba3a05), [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01)]:
  - @ts-pf/client@0.2.2
  - @ts-pf/server@0.4.2
  - @ts-pf/server-http@0.3.2
  - @ts-pf/client-http@0.2.2
  - @ts-pf/contract@0.2.2
  - @ts-pf/protocol@0.2.1

## 0.2.1

### Patch Changes

- Updated dependencies [[`a2b4bdc`](https://github.com/crobinson42/ts-pf/commit/a2b4bdcbf7a51eae2e8ad919dcb5f92abebcb3ea)]:
  - @ts-pf/contract@0.2.1
  - @ts-pf/client@0.2.1
  - @ts-pf/client-http@0.2.1
  - @ts-pf/server@0.4.1
  - @ts-pf/server-http@0.3.1

## 0.2.0

### Minor Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`3c61912`](https://github.com/crobinson42/ts-pf/commit/3c6191249ca1c7480af807f5559cfbb4bb9979b6) Thanks [@crobinson42](https://github.com/crobinson42)! - `createAstroHandler(handler, { context })` checks `context` against the `TCtx` the `FetchHandler` inferred from the app, and `createAstroLocalClient(app, Astro, context)` checks it against the app's `$context<C>()` type (both use `NoInfer`, so the context value no longer widens the inferred type). `createAstroClient<T = never>({ prefix })` follows the `createClient` rule: without `<typeof contract>` the result is `{ readonly '~error': 'Pass createAstroClient<typeof contract>({ prefix })' }` instead of an empty client; a `ContractClient<typeof contract>` annotation on the variable or return type still supplies `T`.

  Previously compiling code that can stop compiling, intended: a `context` value or factory result that does not satisfy the app's `$context<C>()`, and member access on an un-annotated `createAstroClient({ prefix })` result (which was `{}` before).

### Patch Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`601664f`](https://github.com/crobinson42/ts-pf/commit/601664f0ac3a1a81c36964b44cc26b25640e8c58) Thanks [@crobinson42](https://github.com/crobinson42)! - Declare `@ts-pf/contract` as a dependency. `./server` and `./client` import the `ContractClient` type from it in their published `.d.ts`, so strict / isolated installs (pnpm) no longer fail with TS2307.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`cb51622`](https://github.com/crobinson42/ts-pf/commit/cb51622dff3f379bb1f890d07ab917950c2222f7) Thanks [@crobinson42](https://github.com/crobinson42)! - Internal: option bags are built with `defined()` from `@ts-pf/protocol` (now a declared dependency). No behaviour change.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only. READMEs that did not name every symbol in their skill's `## API` section gain a matching `API` list (`check:skills` now asserts it), and every fenced `ts` block in READMEs and skills now type-checks against `dist` (`check:snippets`): missing `procedure` / `z` / `catalog` / `spawn` / `FetchHandler` imports were added, Node-resolved relative imports carry `.js`, the server skill implements the whole example contract, and prose fragments are marked `no-check`.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb) Thanks [@crobinson42](https://github.com/crobinson42)! - Declare `engines.node >=22` and ship the MIT `LICENSE` file in the tarball.

- Updated dependencies [[`d3498b5`](https://github.com/crobinson42/ts-pf/commit/d3498b57ed2d48b159b80f3c952e33a5824af77c), [`fb03a52`](https://github.com/crobinson42/ts-pf/commit/fb03a52ac4e8d520cd6b30c24331af8069de9cd5), [`f75393d`](https://github.com/crobinson42/ts-pf/commit/f75393d25ee6e1cfc4473b2a06fe50921d423d4c), [`f84277c`](https://github.com/crobinson42/ts-pf/commit/f84277c2d165088bc18fa1b8d4e795d46d836764), [`23f457e`](https://github.com/crobinson42/ts-pf/commit/23f457e4e47d5f39506034272b22c35417f11618), [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5), [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb), [`5e5a998`](https://github.com/crobinson42/ts-pf/commit/5e5a99848231e36d8bfa1ef57db9169aee6d9750), [`fb03a52`](https://github.com/crobinson42/ts-pf/commit/fb03a52ac4e8d520cd6b30c24331af8069de9cd5), [`025c1c4`](https://github.com/crobinson42/ts-pf/commit/025c1c47ca5ec7484e2c3d388278c5fe8380c6e6), [`53aaa5a`](https://github.com/crobinson42/ts-pf/commit/53aaa5a33ffee876b237ef6a85744c99cd4aa7d1), [`e7ccbb5`](https://github.com/crobinson42/ts-pf/commit/e7ccbb55b4431a10e8bd301cafc9eb21ff54984c), [`4eb1dcc`](https://github.com/crobinson42/ts-pf/commit/4eb1dcc0fc4ec3ec8d843e953be5b60330bc10db), [`3c61912`](https://github.com/crobinson42/ts-pf/commit/3c6191249ca1c7480af807f5559cfbb4bb9979b6), [`821acc1`](https://github.com/crobinson42/ts-pf/commit/821acc1638700dc90e83ec93dfba909cb234e8b4), [`6e78e6e`](https://github.com/crobinson42/ts-pf/commit/6e78e6e3228a093edd2d93795ca0d7563d4acec9), [`fb03a52`](https://github.com/crobinson42/ts-pf/commit/fb03a52ac4e8d520cd6b30c24331af8069de9cd5), [`1505305`](https://github.com/crobinson42/ts-pf/commit/1505305f3d5df3547f5746243aa710f6a6d835c7), [`d3498b5`](https://github.com/crobinson42/ts-pf/commit/d3498b57ed2d48b159b80f3c952e33a5824af77c), [`3268bc4`](https://github.com/crobinson42/ts-pf/commit/3268bc4b3cb5b94ceb8e8cb6473b0d7785911b8d), [`025c1c4`](https://github.com/crobinson42/ts-pf/commit/025c1c47ca5ec7484e2c3d388278c5fe8380c6e6)]:
  - @ts-pf/client@0.2.0
  - @ts-pf/client-http@0.2.0
  - @ts-pf/contract@0.2.0
  - @ts-pf/protocol@0.2.0
  - @ts-pf/server@0.4.0
  - @ts-pf/server-http@0.3.0

## 0.1.1

### Patch Changes

- d5892e5: No behavior change. This is the first version published by the release workflow.

## 0.1.0

### Minor Changes

- 276aa9e: Add `@ts-pf/astro` for Astro API routes (`createAstroHandler`) and in-process page calls (`createAstroLocalClient`). Browser and island code uses `createAstroClient`. The contract skill catalog lists the package.

### Patch Changes

- @ts-pf/client@0.1.5
- @ts-pf/client-http@0.1.5
- @ts-pf/server@0.3.1
- @ts-pf/server-http@0.2.1
