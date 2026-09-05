---
name: ts-pf-codegen
description: Use when emitting a split-repo ts-pf Contract .d.ts from catalog() with emit, catalogHash, or ts-pf-codegen. Triggers: @ts-pf/codegen, emit(), catalogHash(), ts-pf-codegen, generated Contract.
---

# @ts-pf/codegen

Print a nested `Contract` `.d.ts` from `catalog()`. Frontend still uses `createClient<Contract>(link)`.

Install: `npm i @ts-pf/codegen`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { catalog } from '@ts-pf/docs'
import { emit, catalogHash } from '@ts-pf/codegen'
import { writeFileSync } from 'node:fs'

const spec = catalog(contract, { prefix: '/rpc' })
writeFileSync('contract.d.ts', emit(spec))
catalogHash(spec) // 'sha256:<hex>'
```

```ts
import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { Contract } from './contract.js'

const client = createClient<Contract>(new FetchLink({ url: '/rpc' }))
```

CLI: `ts-pf-codegen emit <catalog.json|-> [-o contract.d.ts]`. Also `pull` / `hash`. Serve `catalog.json` in userland, not `FetchHandler`.

## API

- `emit`, `catalogHash`, `EmitOptions`
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
