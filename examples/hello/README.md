# hello

Fetch is the default adapter: one contract, an implementer, `FetchHandler` on the server, `createClient` + `FetchLink` on the client.

## What it shows

- `src/contract.ts`: `router` / `procedure` with zod and typebox schemas side by side.
- `src/app.ts`: `createImplementer(contract)` → the implemented router `app`.
- `src/server.ts`: `new FetchHandler(app)` behind a `/rpc` prefix, exported as `fetch(req)`.
- `src/client.ts`: `createClient(new FetchLink({ url, fetch }))`; it never imports `@ts-pf/server`.
- `src/serve.ts`: example-local `node:http` bridge so `npm run dev` can listen on a port. ts-pf ships no Node adapter (see `.agents/rules.md`); this file is not one. Bodies are buffered, no streaming.

## Run

Build the packages once from the repo root (`npm install && npm run build`), then in this folder:

```sh
npm test       # smoke test: client → handler in-process, no port
npm run dev    # tsc → dist/, then http://127.0.0.1:8787 (set PORT to change)
curl -X POST http://127.0.0.1:8787/rpc/planet/find \
  -H 'content-type: application/json' -d '{"input":{"id":1}}'
# {"ok":true,"output":{"id":1,"name":"Earth"}}
```

`dev` compiles first because Node's type stripping does not resolve the `.js` import specifiers this example (like any `module: Node16` consumer) uses.

## What the smoke test asserts

`tests/smoke.test.ts` wires `FetchLink` to `server.ts` through an in-process `fetch` and checks that `planet.list` contains Earth and Mars, `planet.find({ id: 1 })` returns Earth, and `planet.create({ name: 'Venus' })` returns `{ id: 3, name: 'Venus' }`.
