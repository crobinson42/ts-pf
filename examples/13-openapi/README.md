# 13 — openapi

Opt-in `@ts-pf/openapi`. Project `catalog()` to an OpenAPI 3.1 document that describes POST JSON RPC.

**Packages:** `@ts-pf/contract`, `@ts-pf/docs`, `@ts-pf/openapi`, `@ts-pf/stream`

## Run

```sh
pnpm --filter @ts-pf/example-13-openapi demo
```

No HTTP server. This is not a FetchHandler plugin and not Scalar.

Serve the spec in **userland**, outside the RPC prefix:

```ts
if (url.pathname === '/openapi.json') {
  return Response.json(spec)
}
const result = await handler.handle(req, { prefix: '/rpc', context })
```

Do not put the spec under `/rpc/...` — `FetchHandler` will treat that path as a procedure. Point Scalar or Swagger UI at `/openapi.json`; those UIs are not part of `@ts-pf/openapi`.

For a split-repo TypeScript client, use [14-codegen](../14-codegen) (`emit` → `createClient<Contract>`). Do not treat this OpenAPI document as the first-party typed client.

## Look at

- `src/contract.ts` — `docs()` plus a stream procedure and a hidden one
- `src/demo.ts` — `openapi(catalog(contract, { prefix: '/rpc' }), { info })`
