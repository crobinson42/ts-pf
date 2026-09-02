# 10 — docs

Opt-in `@ts-pf/docs`. Generate a procedure catalog from the **contract** (not `app`). Renderers are userland.

**Packages:** `@ts-pf/contract`, `@ts-pf/docs`

## Run

```sh
pnpm --filter @ts-pf/example-10-docs demo
```

No HTTP server. This is not a FetchHandler plugin and not Scalar.

## Look at

- `src/contract.ts` — `procedure.meta(docs({ description }))`
- `src/demo.ts` — `catalog(contract, { prefix: '/rpc' })`
- `src/markdown.ts` — example renderer; not part of `@ts-pf/docs`
