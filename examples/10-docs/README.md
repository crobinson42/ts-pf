# 10 — docs

Opt-in `@ts-pf/docs`. Generate a procedure catalog from the **contract** (not `app`). Renderers are userland. The catalog is the portable spec: project it with [13-openapi](../13-openapi) (OpenAPI 3.1) or [14-codegen](../14-codegen) (nested `Contract` `.d.ts`).

**Packages:** `@ts-pf/contract`, `@ts-pf/docs`

## Run

```sh
pnpm --filter @ts-pf/example-10-docs demo
```

No HTTP server. This is not a FetchHandler plugin and not Scalar.

Serve the catalog in **userland**, outside the RPC prefix:

```ts
if (url.pathname === '/catalog.json') {
  return Response.json(catalog(contract, { prefix: '/rpc' }))
}
const result = await handler.handle(req, { prefix: '/rpc', context })
```

Do not put the catalog under `/rpc/...` — `FetchHandler` will treat that path as a procedure.

## Look at

- `src/contract.ts` — `procedure.meta(docs({ description }))`
- `src/demo.ts` — `catalog(contract, { prefix: '/rpc' })`
- `src/markdown.ts` — example renderer; not part of `@ts-pf/docs`
