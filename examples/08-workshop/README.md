# 08 — workshop

A small contract-first app. The contract is its own package. The API implements it. The Vite UI depends on the contract, `@ts-pf/client`, and `@ts-pf/sse` — not `@ts-pf/server`.

```
contract  →  api   (@ts-pf/server, FetchHandler, SseCodec)
          →  web   (@ts-pf/client, FetchLink, SseCodec)
```

**Not here:** file upload. `FetchHandler` takes one codec. This app uses `SseCodec` so describe can stream. Multipart is [05-files](../05-files).

## Run

From the repo root:

```sh
pnpm --filter @ts-pf/example-08-workshop dev
```

- API: `http://127.0.0.1:3108/rpc`
- UI: `http://127.0.0.1:5173`

Vite proxies `/rpc` to the API (no CORS needed locally). `CORSPlugin` is still on the handler so a real separate origin (`http://127.0.0.1:5173` hitting `:3108` directly) works.

Default bearer token is `demo` (create is protected). Clear it to see `UNAUTHORIZED`. Find id `999` to see `asResult` narrow `NOT_FOUND`.

## Look at

- `contract/src/index.ts` — shared procedures, declared errors, `stream()`
- `api/src/app.ts` — `createImplementer(contract)`, middleware, generator handler
- `web/src/client.ts` — `createClient<typeof contract>`; no `@ts-pf/server`
