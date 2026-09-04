# 15 — mvc-kit

Contract-first React app using `@ts-pf/mvc-kit` with mvc-kit `Resource` + `ViewModel`. The contract is its own package. The API implements it. The Vite UI depends on the contract, `@ts-pf/client`, `@ts-pf/mvc-kit`, and `mvc-kit` — not `@ts-pf/server`.

```
contract  →  api   (@ts-pf/server, FetchHandler)
          →  web   (@ts-pf/client, FetchLink, bindClient, Resource)
```

## Run

From the repo root:

```sh
pnpm --filter @ts-pf/example-15-mvc-kit dev
```

- API: `http://127.0.0.1:3115/rpc`
- UI: `http://127.0.0.1:5175`

Vite proxies `/rpc` to the API. `CORSPlugin` is still on the handler so a real separate origin works.

## Look at

- `contract/src/index.ts` — shared procedures
- `api/src/app.ts` — `createImplementer(contract)`
- `web/src/client.ts` — `createClient` only; no `@ts-pf/server`
- `web/src/planets-resource.ts` — `bindClient(client, this)` + `optimistic()`
- `web/src/planets-view-model.ts` — encapsulates the Resource; `asResult` + `issuesToFieldErrors`
- `web/src/app.tsx` — `useLocal`; components do not import the client or Resource

Next: this is the last numbered example. `createClient<Contract>(link)` from [`14-codegen`](../14-codegen) still works with `bindClient`.
