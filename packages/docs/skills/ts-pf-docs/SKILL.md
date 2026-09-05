---
name: ts-pf-docs
description: Use when building a ts-pf procedure catalog with docs(), catalog(), walkContract, or registerJsonSchemaConverter. Triggers: @ts-pf/docs, catalog(), docs(), walkContract.
---

# @ts-pf/docs

Opt-in procedure catalog from a **contract**. Does not serve HTTP.

Install: `npm i @ts-pf/docs@beta`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { docs, catalog } from '@ts-pf/docs'

procedure.meta(docs({ description: 'Find a planet by id' }))
const spec = catalog(contract, { prefix: '/rpc' })
```

Serve JSON in userland, outside the RPC prefix:

```ts
if (url.pathname === '/catalog.json') {
  return Response.json(catalog(contract, { prefix: '/rpc' }))
}
```

`docs.hidden: true` omits the procedure unless `filter: () => true`. Unconverted schemas become `{ kind: 'unavailable' }` — they do not fail the catalog.

## API

- `docs`, `getDocs`, `catalog`, `walkContract`
- `registerJsonSchemaConverter`, `toJsonSchema`

## Pair with

- OpenAPI: `ts-pf-openapi`
- Split-repo `.d.ts`: `ts-pf-codegen`
- Descriptions live on existing `.meta()` — not `.docs()` on the builder

## Don't

- `.docs()` on the contract builder.
- Serve the catalog from `FetchHandler` (`GET /rpc/...` is a procedure miss).
- Walk an implemented `app` — pass `contract`.
- REST `method` / `path` / path params.
