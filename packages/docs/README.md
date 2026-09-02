# @ts-pf/docs

Opt-in procedure catalog for a ts-pf **contract**. Walks procedures into JSON you can render, snapshot, or later project to OpenAPI.

This package does **not** serve HTTP, embed Scalar/Swagger, or invent REST paths. The protocol stays POST JSON RPC.

## Attach descriptions

Descriptions live on existing `.meta()`. The helper is sugar so the key stays stable:

```ts
import { procedure, router } from '@ts-pf/contract'
import { docs } from '@ts-pf/docs'
import { z } from 'zod'

export const contract = router({
  planet: {
    find: procedure
      .meta(docs({ description: 'Find a planet by id' }))
      .meta({ auth: true })
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({ NOT_FOUND: { status: 404 } }),
  },
})
```

`docs.hidden: true` omits the procedure from `catalog()` unless you pass `filter: () => true`.

## Generate a catalog

```ts
import { catalog } from '@ts-pf/docs'
import { contract } from './contract'

const spec = catalog(contract, { prefix: '/rpc' })
// spec.procedures[0].key === 'planet/find'
// spec.procedures[0].href === '/rpc/planet/find'
// spec.protocol.method === 'POST'
console.log(JSON.stringify(spec, null, 2))
```

JSON Schema conversion uses Standard JSON Schema (`~standard.jsonSchema`) then TypeBox. Register more with `registerJsonSchemaConverter` (same accept-first pattern as `registerSchemaAdapter`). Unconverted schemas become `{ kind: 'unavailable', reason }` — they do not fail the catalog.

`walkContract(contract)` is public if you want a markdown/HTML renderer without waiting on this package.

## Not in this package

- OpenAPI / Swagger / Scalar
- GET `/rpc/docs`
- REST `method` / `path` / path params
- Walking an implemented `app` (pass `contract`)
- `.docs()` on the contract builder
