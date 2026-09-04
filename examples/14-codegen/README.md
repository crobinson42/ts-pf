# 14 — codegen

Opt-in `@ts-pf/codegen`. Print a nested `Contract` `.d.ts` from `catalog()` so a split-repo frontend can `createClient<Contract>(link)` without importing the backend contract. The catalog comes from [10-docs](../10-docs). OpenAPI for other languages is [13-openapi](../13-openapi).

**Packages:** `@ts-pf/contract`, `@ts-pf/docs`, `@ts-pf/codegen`, `@ts-pf/stream`

## Run

```sh
pnpm --filter @ts-pf/example-14-codegen demo
```

No HTTP server. This is not a FetchHandler plugin. Commit the `.d.ts`, or CI-run `ts-pf-codegen pull` and pin `catalog.lock.json`.

Serve the catalog in **userland**, outside the RPC prefix:

```ts
// Userland — not FetchHandler, not @ts-pf/codegen:
if (url.pathname === '/catalog.json') {
  return Response.json(catalog(contract, { prefix: '/rpc' }))
}
const result = await handler.handle(req, { prefix: '/rpc', context })
```

Do not put the catalog under `/rpc/...` — `FetchHandler` will treat that path as a procedure.

```
ts-pf-codegen pull https://api.example.com/catalog.json -o contract.d.ts --lock catalog.lock.json
```

Then:

```ts
import { createClient, FetchLink } from '@ts-pf/client'
import type { Contract } from './contract.js'

const client = createClient<Contract>(new FetchLink({ url: '/rpc' }))
await client.planet.find({ id: 1 })
```

## Look at

- `src/contract.ts` — `docs()` plus a stream procedure and a hidden one
- `src/demo.ts` — `emit(catalog(contract, { prefix: '/rpc' }))`
