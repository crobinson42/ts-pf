# @ts-pf/openapi

Project a `@ts-pf/docs` `catalog()` into an **OpenAPI 3.1** document that describes the existing POST JSON RPC.

Agent skill: [`skills/ts-pf-openapi/`](skills/ts-pf-openapi/). Sync with `npx skills experimental_sync -y`.

The catalog is the portable spec. This package is the **polyglot** export. For a TypeScript client in another repo, use [`@ts-pf/codegen`](../codegen) (`emit` → `createClient<Contract>`), not OpenAPI-TS.

This package does **not** serve HTTP, embed Scalar/Swagger, invent REST paths, or change `FetchHandler`. Path params, GET/PUT, and flattened bodies are out.

```ts
import { catalog, docs } from '@ts-pf/docs'
import { openapi } from '@ts-pf/openapi'

procedure.meta(docs({ description: 'Find a planet by id' }))

const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
  info: { title: 'Planet API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
})
```

Every path is `POST {prefix}/{router keys}` with body `{ "input": … }` and `{ "ok": true, "output": … }` / `{ "ok": false, "error": { "code", "message", "data?" } }`. The protocol header comes from `catalog.protocol`.

Serve the JSON in userland, **outside** the RPC prefix (`GET /rpc/...` is not a spec):

```ts
if (url.pathname === '/openapi.json') {
  return Response.json(spec)
}
const result = await handler.handle(req, { prefix: '/rpc', context })
```

Point Scalar or Swagger UI at that URL. Do not put those UIs in this package.

`openapi()` is a dumb projection of the catalog. Filter/hide procedures with `catalog(..., { filter })`. Mutate the returned object for `security`, extra `components`, or operation overrides.

Stream procedures advertise `application/jsonl` (item schema from the catalog). Pass `sse: true` to also list `text/event-stream`. Pass `multipart: true` to also list `multipart/form-data` on unary requests. Default is JSON (and JSONL for streams).

`$ref` values inside converted JSON Schema (`#/$defs/…`) are rewritten to the component they live under. `$anchor` / `$dynamicAnchor` across schemas are not rewritten.

Message transports (WebSocket, stdio, MessagePort) are not HTTP and are not in this document.

Typed split-repo clients: [`@ts-pf/codegen`](../codegen).
