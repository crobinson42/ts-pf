---
name: ts-pf-codegen
description: "Use when emitting a split-repo ts-pf Contract .d.ts from catalog() with emit, emitFiles, catalogHash, or ts-pf-codegen, or when failing CI on breaking catalog changes with diffCatalog / ts-pf-codegen diff. Triggers: @ts-pf/codegen, emit(), emitFiles(), catalogHash(), diffCatalog(), ts-pf-codegen, ts-pf-codegen diff, generated Contract, breaking change, catalog.json."
---

# @ts-pf/codegen

Print a nested `Contract` `.d.ts` from `catalog()`. Frontend still uses `createClient<Contract>(link)`. Diff two catalogs for breaking changes. Example: `examples/codegen`.

Install: `npm i @ts-pf/codegen`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { catalog } from '@ts-pf/docs'
import { emit, catalogHash } from '@ts-pf/codegen'
import { writeFileSync } from 'node:fs'

const spec = catalog(contract, { prefix: '/rpc' })
writeFileSync('catalog.json', JSON.stringify(spec, null, 2))
writeFileSync('contract.d.ts', emit(spec))
catalogHash(spec) // 'sha256:<hex>'
```

```ts
import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { Contract } from './contract.js'

const client = createClient<Contract>(new FetchLink({ url: '/rpc' }))
```

`emit()` prints JSDoc from `docs()` (`description` / `summary` / `@deprecated`) onto `Contract` members. Other `.meta()` stays on the catalog — ship `catalog.json` beside the `.d.ts` for runtime policy (`CachePlugin` `key`, etc.). Hover on `client.planet.find` may not show that JSDoc (`ContractClient` is a mapped type).

A large catalog: `emitFiles()` writes one entry plus a file per group and procedure. `_phantom.d.ts` is added only when some error has `data`. The entry stays `createClient<Contract>`. Open the group file for the scope, the procedure file for one endpoint. `catalogHash` is on the entry only. Each file's header starts with `role:` (`entry`, `group`, `procedure`, `phantom`). Group files name `path:`, `exports:`, and `parent:`. Procedure files name `path:`, `call:` (`client.planet.find(input)`), `exports:`, and `group:` when nested, plus a one-line `summary:` when `docs()` has one. `_phantom.d.ts` says it is internal.

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { catalog } from '@ts-pf/docs'
import { emitFiles } from '@ts-pf/codegen'

const spec = catalog(contract, { prefix: '/rpc' })
for (const file of emitFiles(spec)) {
  const path = join('src/generated', file.path)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, file.contents)
}
```

```ts
import type { Contract } from './src/generated/contract.js'
```

CLI: `npx ts-pf-codegen emit <catalog.json|-> [-o contract.d.ts | --out-dir <dir>]`. `--out-dir` owns that directory (deletes stale `.d.ts`, refuses any other file). Also `pull` / `hash` / `diff`; `--help` / `-h` print usage. Serve `catalog.json` in userland, not `FetchHandler`.

Breaking-change check: commit `catalog.json`; in CI write the current one and run `npx ts-pf-codegen diff catalog.json catalog.next.json [--json]` — exit `2` on a breaking change, `0` otherwise, `1` on a usage, read, or parse error. One path may be `-` (stdin). Or in code:

```ts
import { readFileSync } from 'node:fs'
import { diffCatalog } from '@ts-pf/codegen'
import { catalog, type ProcedureCatalog } from '@ts-pf/docs'

const previous = JSON.parse(
  readFileSync('catalog.json', 'utf8'),
) as ProcedureCatalog
const diff = diffCatalog(previous, catalog(contract, { prefix: '/rpc' }))
diff.breaking // CatalogChange[]: { kind, path?, pointer?, message }
```

Direction decides: inputs are what old clients send, outputs and error `data` what they receive. Breaking: procedure removed / renamed, unary ↔ stream, protocol version, input schema added where there was none, input required property added or optional → required, input narrowed (enum value / union variant removed, `number` → `integer`, tighter bounds, `null` dropped, object closed, property removed from a closed object), output required property removed or required → optional, output type changed / widened (now `null`, looser bounds), output or error `data` schema removed. Safe: procedure added, optional input property, output property / enum value / union variant added or removed, output narrowed, error code added or removed, error `status` change, `docs({ deprecated: true })`. Docs text and `format` are ignored; unmodeled keywords (`pattern`, `prefixItems` tuples, `allOf`, …) are a safe `unknown-change`.

## API

- `emit`, `emitFiles`, `catalogHash`, `diffCatalog`, `EmitOptions`, `EmitFile`, `CatalogDiff`, `CatalogChange`
- CLI `ts-pf-codegen` (not exported from `"."`)

## Pair with

- Catalog: `ts-pf-docs`
- Client: `ts-pf-client`
- Polyglot spec: `ts-pf-openapi`

## Don't

- `createClientFromCatalog`.
- Generate from a live `app` or `tsc --dts` of the backend.
- Name the generated type `AppRouter` — it is `Contract`.
- Serve the catalog from `FetchHandler`.
- Point `--out-dir` at a directory that holds anything other than generated `.d.ts` files.
- Treat an empty `diff.breaking` as proof of compatibility — keywords the check does not model are reported as safe `unknown-change`.
