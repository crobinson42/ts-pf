# 01 — hello

The README happy path as a runnable app: a contract, an implemented `app`, `FetchHandler`, and `createClient`.

**Packages:** `@ts-pf/contract`, `@ts-pf/server`, `@ts-pf/client`

## Run

```sh
pnpm --filter @ts-pf/example-01-hello demo
```

Two terminals: `start` then `client`. Default port `3101` (`PORT` overrides).

Expected:

```
list [ { id: 1, name: 'Earth' }, { id: 2, name: 'Mars' } ]
find { id: 1, name: 'Earth' }
create { id: 3, name: 'Venus' }
```

## Look at

- `src/contract.ts` — `procedure` / `router`. Nested keys become the path (`/rpc/planet/find`). Zod and TypeBox in one contract.
- `src/app.ts` — `createImplementer(contract)` then `impl.router({ ... })`. The implemented router is `app`.
- `src/server.ts` — `new FetchHandler(app)` and `handler.handle`. The listen helper is Node glue, not a ts-pf adapter.
- `src/client.ts` — `createClient<typeof contract>(new FetchLink({ url }))`. This file does not import `@ts-pf/server`.

Unknown ids currently throw and become `INTERNAL`. [02-errors](../02-errors) declares `NOT_FOUND`.
