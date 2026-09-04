# 12 — SWR

Contract-first React app using `@ts-pf/swr`. The contract is its own package. The API implements it. The Vite UI depends on the contract, `@ts-pf/client`, and `@ts-pf/swr` — not `@ts-pf/server`.

```
contract  →  api   (@ts-pf/server, FetchHandler)
          →  web   (@ts-pf/client, FetchLink, createSwr, useSWR)
```

## Run

From the repo root:

```sh
pnpm --filter @ts-pf/example-12-swr dev
```

- API: `http://127.0.0.1:3112/rpc`
- UI: `http://127.0.0.1:5174`

Vite proxies `/rpc` to the API. `CORSPlugin` is still on the handler so a real separate origin works.

## Look at

- `contract/src/index.ts` — shared procedures
- `api/src/app.ts` — `createImplementer(contract)`
- `web/src/client.ts` — `createClient` + `createSwr`; no `@ts-pf/server`
- `web/src/app.tsx` — `useSWR` / `useSWRMutation` / `mutate(swr.planet.matcher())`

Next: [13-openapi](../13-openapi) and [14-codegen](../14-codegen) project `catalog()` when the UI cannot import the contract package. `createSwr` takes the client from `createClient<Contract>(link)` (generated `.d.ts`).
