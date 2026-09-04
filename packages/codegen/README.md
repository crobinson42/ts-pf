# @ts-pf/codegen

Print a nested `Contract` `.d.ts` from a `@ts-pf/docs` `catalog()`. The frontend uses today's `createClient<Contract>(link)` — no second runtime, no `as typeof contract`, no `tsc --dts` of the backend.

Types never come from `fetch()` or `JSON.parse` casts. The catalog is the spec; the `.d.ts` is the TypeScript contract.

```ts
import { catalog } from '@ts-pf/docs'
import { emit } from '@ts-pf/codegen'
import { writeFileSync } from 'node:fs'

const spec = catalog(contract, { prefix: '/rpc' })
writeFileSync('catalog.json', JSON.stringify(spec, null, 2))
writeFileSync('contract.d.ts', emit(spec))
```

```ts
import { asResult, createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { Contract } from './contract.js'

const client = createClient<Contract>(new FetchLink({ url: '/rpc' }))
await client.planet.find({ id: 1 })

const result = await asResult(client.planet.find({ id: 1 }))
if (!result.ok && result.error.code === 'NOT_FOUND') {
  result.error.data.id
}
```

## `emit` / `catalogHash`

```ts
import { emit, catalogHash, type EmitOptions } from '@ts-pf/codegen'

emit(catalog, {
  name: 'Contract', // default
  failOnUnavailable: false, // default; true throws on kind: 'unavailable'
  banner: true, // catalogVersion + sha256 hash
})

catalogHash(catalog) // 'sha256:<hex>' of canonical JSON
```

Generated procedures are `ContractProcedure<I, O, E>` with Phantom Standard Schema leaves so `InferErrorData` / `asResult` still narrow `error.code === 'NOT_FOUND'`. Protocol errors stay out of the generated error map (`ClientError` already unions them). No-input is `void`. Streams are `AsyncIterable<Item>`.

The generated file uses `import type { ContractProcedure } from '@ts-pf/contract'`. This package does not import contract at runtime.

## CLI

```
ts-pf-codegen emit <catalog.json|-> [-o contract.d.ts] [--name Contract] [--fail-on-unavailable]
ts-pf-codegen pull <url> [-o contract.d.ts] [--lock catalog.lock.json]
ts-pf-codegen hash <catalog.json|->
```

`emit` and `hash` read stdin when the path is `-`. Omit `-o` to write the `.d.ts` to stdout.

Commit `contract.d.ts`, or CI-run `ts-pf-codegen pull` and pin `catalog.lock.json`:

```json
{
  "url": "https://api.example.com/catalog.json",
  "catalogVersion": 1,
  "catalogHash": "sha256:…"
}
```

Mismatch on pull exits non-zero. No registry in v1.

## Serve the catalog in userland

Do **not** put this on `FetchHandler`. A GET under `/rpc/...` is a procedure miss / `METHOD_NOT_ALLOWED`, not a spec.

```ts
// Userland — not FetchHandler, not @ts-pf/codegen:
if (url.pathname === '/catalog.json') {
  return Response.json(catalog(contract, { prefix: '/rpc' }))
}
const result = await handler.handle(req, { prefix: '/rpc', context })
```

## Not in this package

- `createClientFromCatalog`
- Folding into `@ts-pf/client` or `@ts-pf/docs`
- OpenAPI-TS as the typed client (use `@ts-pf/openapi` for the polyglot export)
- Type-level `FromSchema` over imported JSON
- `tsc --dts` of the live router
- Serving catalog from FetchHandler
- Auth on `pull` (later)
- A schema registry

The catalog is the portable spec. [`@ts-pf/openapi`](../openapi) remains the polyglot OpenAPI 3.1 export.
