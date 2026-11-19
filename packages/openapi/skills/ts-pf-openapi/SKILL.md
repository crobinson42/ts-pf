---
name: ts-pf-openapi
description: "Use when projecting a ts-pf catalog() to OpenAPI 3.1 with openapi(). Triggers: @ts-pf/openapi, openapi(), OpenAPI 3.1, POST JSON RPC spec."
---

# @ts-pf/openapi

OpenAPI 3.1 projection of `catalog()`. POST JSON RPC only. Not a runtime.

Install: `npm i @ts-pf/openapi`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { procedure } from '@ts-pf/contract'
import { catalog, docs } from '@ts-pf/docs'
import { openapi } from '@ts-pf/openapi'

procedure.meta(docs({ description: 'Find a planet by id' }))

const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
  info: { title: 'Planet API', version: '1.0.0' },
})
```

Every path is `POST {prefix}/{router keys}`. Serve JSON in userland (`GET /openapi.json`), not from `FetchHandler`. Point Scalar/Swagger at that URL — do not embed those UIs here.

Typed split-repo clients: `ts-pf-codegen`, not OpenAPI-TS.

## Component names and schema normalizations

Same schemas as the catalog, normalized for code generators:

- No nested `$schema` (the document's `jsonSchemaDialect` declares it).
- Output and error `data` schemas are open (no `additionalProperties: false`). Inputs and the `{ ok, … }` envelopes are unchanged.
- Root `$defs` / `definitions` are hoisted (every key except `__schemaN` is an id): `.meta({ id: 'Book' })` → `components.schemas.Book`, one component across procedures. `<path>.Input` / `<path>.Output` stay; a bare named type is a `$ref` to it.
- Input shape differs from output (a field with a default, or a closed object such as `z.strictObject`, since inputs stay closed) → output `Book`, input `BookInput`. One side only or the same shape → `Book`. Two shapes for one id on the same side, a taken `<id>Input`, or an id equal to another component name throws: give one schema a distinct `.meta({ id })`.
- Zod's unnamed recursion (any def key `__schemaN`) → `<host>.__schemaN`, shared only when side and shape are identical; give it an id for a stable name.
- Declared errors: one `Error.<CODE>` (+ `Error.<CODE>.Data`) when every procedure's `data` shape matches (or none), including a code only one procedure declares; else `<path>.Error.<CODE>` per procedure. Protocol errors: `TsPf.Error.<CODE>` (+ `TsPf.Error.VALIDATION.Data`).

Post-processing by component name? Use these names; older versions emitted `<path>.Error.<CODE>` and `$defs` under each procedure component.

## Documenting a GET bridge or REST facade

`openapi()` stays POST only. If you serve the userland GET bridge (`ts-pf-server-http`, "Cacheable reads"), add the `get` operations to the returned document yourself. Each opted-in catalog entry carries its contract meta, and the GET reuses the POST's responses:

```ts
import { catalog } from '@ts-pf/docs'
import { openapi } from '@ts-pf/openapi'
import { contract } from './contract.js'

const cat = catalog(contract, { prefix: '/rpc' })
const spec = openapi(cat, { info: { title: 'Planet API', version: '1.0.0' } })

for (const proc of cat.procedures) {
  const http = proc.meta.http as { method?: string } | undefined
  const item = proc.href === undefined ? undefined : spec.paths[proc.href]
  if (http?.method !== 'GET' || !item?.post) continue
  // `content` (a JSON-encoded parameter) is OpenAPI 3.1, wider than `PathItem`'s type.
  Object.assign(item, {
    get: {
      operationId: `${item.post.operationId}Get`,
      parameters: [{
        name: 'input',
        in: 'query',
        content: {
          // The hoisted input component (its $refs resolve in this document).
          'application/json': {
            schema:
              proc.input === undefined
                ? {}
                : { $ref: `#/components/schemas/${item.post.operationId}.Input` },
          },
        },
      }],
      responses: item.post.responses,
    },
  })
}
```

A REST facade has its own paths and bodies, so it documents them by hand (or with your REST framework's generator). Reference the components `openapi()` already emitted (`#/components/schemas/<id>`, `<id>Input` for request bodies when the id split, `<path>.Input`, `<path>.Output`) instead of redeclaring them.

## API

- `openapi`
- `OpenAPIOptions` (`sse: true` / `multipart: true` advertise those content types), `OpenAPIDocument`

## Pair with

- Catalog: `ts-pf-docs`
- Typed client `.d.ts`: `ts-pf-codegen`

## Don't

- GET/PUT/path params or flattened REST bodies from `openapi()` itself. Post-process the document in userland.
- Serve the spec from `FetchHandler`.
- Message transports (not HTTP) in this document.
