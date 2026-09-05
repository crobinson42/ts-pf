# @ts-pf/docs

Opt-in procedure catalog for a ts-pf **contract**. Walks procedures into JSON you can render, snapshot, project to OpenAPI with [`@ts-pf/openapi`](../openapi), or print a portable `Contract` `.d.ts` with [`@ts-pf/codegen`](../codegen).

Agent skill: [`skills/ts-pf-docs/`](skills/ts-pf-docs/). Sync with `npx skills experimental_sync -y`.

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

JSON Schema conversion uses Standard JSON Schema (`~standard.jsonSchema`) then TypeBox. Register more with `registerJsonSchemaConverter` (same accept-first pattern as `registerSchemaAdapter`). Unconverted schemas become `{ kind: 'unavailable', reason }` — they do not fail the catalog. `stream()` is `{ kind: 'stream', item? }` (the iterable is not converted; the item schema is). Protocol `VALIDATION` includes its `data.issues` schema on `protocolErrors`.

`walkContract(contract)` is public if you want a markdown/HTML renderer without going through `catalog()`.

## Project the catalog

The catalog is the portable spec (like `.proto` / `openapi.yaml`). Downstream packages print from it — they do not walk a live contract.

OpenAPI 3.1 (polyglot, POST JSON RPC only):

```ts
import { openapi } from '@ts-pf/openapi'

const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
  info: { title: 'Planet API', version: '1.0.0' },
})
```

Typed `.d.ts` for a split-repo `createClient<Contract>`:

```ts
import { emit } from '@ts-pf/codegen'
import { writeFileSync } from 'node:fs'

writeFileSync('contract.d.ts', emit(catalog(contract, { prefix: '/rpc' })))
```

Serve the JSON in **userland**, outside the RPC prefix (`GET /rpc/...` is a procedure miss, not a spec):

```ts
if (url.pathname === '/catalog.json') {
  return Response.json(catalog(contract, { prefix: '/rpc' }))
}
const result = await handler.handle(req, { prefix: '/rpc', context })
```

See [`@ts-pf/openapi`](../openapi) and [`@ts-pf/codegen`](../codegen).

## Not in this package

- OpenAPI / Swagger / Scalar (see [`@ts-pf/openapi`](../openapi))
- Typed-client `.d.ts` codegen (see [`@ts-pf/codegen`](../codegen))
- GET `/rpc/docs` or serving the catalog from `FetchHandler`
- REST `method` / `path` / path params
- Walking an implemented `app` (pass `contract`)
- `.docs()` on the contract builder
