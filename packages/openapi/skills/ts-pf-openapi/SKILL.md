---
name: ts-pf-openapi
description: Use when projecting a ts-pf catalog() to OpenAPI 3.1 with openapi(). Triggers: @ts-pf/openapi, openapi(), OpenAPI 3.1, POST JSON RPC spec.
---

# @ts-pf/openapi

OpenAPI 3.1 projection of `catalog()`. POST JSON RPC only. Not a runtime.

Install: `npm i @ts-pf/openapi@beta`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { catalog, docs } from '@ts-pf/docs'
import { openapi } from '@ts-pf/openapi'

procedure.meta(docs({ description: 'Find a planet by id' }))

const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
  info: { title: 'Planet API', version: '1.0.0' },
})
```

Every path is `POST {prefix}/{router keys}`. Serve JSON in userland (`GET /openapi.json`), not from `FetchHandler`. Point Scalar/Swagger at that URL — do not embed those UIs here.

Typed split-repo clients: `ts-pf-codegen`, not OpenAPI-TS.

## API

- `openapi`
- `OpenAPIOptions` (`sse: true` / `multipart: true` advertise those content types), `OpenAPIDocument`

## Pair with

- Catalog: `ts-pf-docs`
- Typed client `.d.ts`: `ts-pf-codegen`

## Don't

- GET/PUT/path params or flattened REST bodies.
- Serve the spec from `FetchHandler`.
- Message transports (not HTTP) in this document.
