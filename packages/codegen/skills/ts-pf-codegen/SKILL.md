---
name: ts-pf-codegen
description: "Use when emitting a split-repo ts-pf Contract .d.ts from catalog() with emit, emitFiles, catalogHash, or ts-pf-codegen. Triggers: @ts-pf/codegen, emit(), emitFiles(), catalogHash(), ts-pf-codegen, generated Contract."
---

# @ts-pf/codegen

Print a nested `Contract` `.d.ts` from `catalog()`. Frontend still uses `createClient<Contract>(link)`. Example: `examples/codegen`.

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

A large catalog: `emitFiles()` writes one entry plus a file per group and procedure. `_phantom.d.ts` is added only when some error has `data`. The entry stays `createClient<Contract>`. Open the group file for the scope, the procedure file for one endpoint. `catalogHash` is on the entry only.

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

CLI: `npx ts-pf-codegen emit <catalog.json|-> [-o contract.d.ts | --out-dir <dir>]`. `--out-dir` owns that directory (deletes stale `.d.ts`, refuses any other file). Also `pull` / `hash`; `--help` / `-h` print usage. Serve `catalog.json` in userland, not `FetchHandler`.

## API

- `emit`, `emitFiles`, `catalogHash`, `EmitOptions`, `EmitFile`
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
