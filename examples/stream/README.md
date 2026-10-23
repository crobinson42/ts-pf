# stream

`StreamCodec` + `stream()` on the Fetch adapter: a root `AsyncIterable` as procedure input or output, framed as JSONL on the wire.

## What it shows

- `src/contract.ts`: `stream(schema)` as `.output()` (`planet.chat`) and as `.input()` (`planet.ingest`), next to a unary `planet.find`.
- `src/app.ts`: an `async function*` handler that yields tokens and stops on `signal.aborted`; a handler that `for await`s its input.
- `src/server.ts`: `new FetchHandler(app, { codec: new StreamCodec() })`.
- `src/client.ts`: `new FetchLink({ url, fetch, codec: new StreamCodec() })`; the client never imports `@ts-pf/server`.

Unary procedures still travel as plain JSON; the codec only changes the format of `stream()` schemas.

## Run

Build the packages once from the repo root (`npm install && npm run build`), then in this folder:

```sh
npm test
```

## What the smoke test asserts

`tests/smoke.test.ts` wires `FetchLink` to `server.ts` through an in-process `fetch` and checks that `planet.chat({ prompt: 'hello mars' })` yields `['hello', 'mars']`, that `planet.ingest` fed an async generator of `{ chunk: 1 }, { chunk: 2 }` returns `{ count: 3 }`, and that `planet.find({ id: 1 })` still returns `{ id: 1, name: 'Earth' }` as JSON.
