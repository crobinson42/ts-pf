# message

`PortHandler` + `PortLink` over an in-process `MessageChannel`. Same contract and `app` as `hello`; only the pipe changes.

## What it shows

- `src/contract.ts` / `src/app.ts`: the `hello` contract and implementer, unchanged.
- `src/server.ts`: `new PortHandler(app).bind(port, { context })`, which returns a handle with `close()`.
- `src/client.ts`: `new PortLink({ port })` under `createClient`, plus `close()` for the link; it never imports `@ts-pf/server`.

Procedure addresses travel as `string[]` frames, not URL paths. Framing and handshake: `packages/protocol/PROTOCOL.md`, "Message transports".

## Run

Build the packages once from the repo root (`npm install && npm run build`), then in this folder:

```sh
npm test
```

## What the smoke test asserts

`tests/smoke.test.ts` creates a `MessageChannel`, binds the server to `port1` and the client to `port2`, then checks that `planet.list` contains Earth and Mars, `planet.find({ id: 1 })` returns Earth, and `planet.create({ name: 'Venus' })` returns `{ id: 3, name: 'Venus' }`. Both ends are closed in `finally`.
