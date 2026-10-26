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
          'application/json': {
            schema: proc.input?.kind === 'json' ? proc.input.jsonSchema : {},
          },
        },
      }],
      responses: item.post.responses,
    },
  })
}
```

A REST facade has its own paths and bodies, so it documents them by hand (or with your REST framework's generator). Reuse the schemas from `catalog()` entries instead of redeclaring them.

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
