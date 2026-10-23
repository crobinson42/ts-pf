# plugins

Call interceptors and `CallPlugin`s on `createClient` / `FetchHandler`, plus a custom plugin on each side. HTTP `HandlerPlugin`s (`CORSPlugin`) stay on `FetchHandler.plugins`, a different list. Timeout is userland (`AbortSignal.timeout` wrapped as `TimeoutPlugin` here); it is not a first-party plugin.

## What it shows

Client (`src/client.ts`, `src/timeout-plugin.ts`):

```ts no-check
const client = createClient<typeof contract>(new FetchLink({ url: '/rpc' }), {
  plugins: [
    new TimeoutPlugin(5_000),
    new CachePlugin({ ttl: 5_000, key: readKey }),
    new DedupePlugin({ key: readKey }),
    new RetryPlugin({ retries: 2 }),
  ],
  interceptors: [onStart(({ path }) => console.log(path.join('.')))],
})
```

Server (`src/server.ts`, `src/audit-plugin.ts`):

```ts no-check
new FetchHandler(app, {
  plugins: [new CORSPlugin({ origin: '*' })],
  interceptors: applyPlugins([new DedupePlugin({ key: readKey }), audit]),
})
```

`CallPlugin` is `{ name, intercept }`. Array order only: `[0]` is outermost. `next` may replace `input` / `signal` (and on the server, `context`); it cannot change `path`. Pass `key` so cache/dedupe skip writes (`src/read-key.ts` keys `planet.find` only). Server `DedupePlugin` buckets by the context object `handle()` received; share that object (a db/app handle) if overlapping HTTP reads should join. The same plugin list also runs on `createLocalClient`.

## Run

Build the packages once from the repo root (`npm install && npm run build`), then in this folder:

```sh
npm test
```

## What the smoke test asserts

`tests/smoke.test.ts` runs against an in-process `fetch` that honours `AbortSignal` and checks: the basic `list` / `find` / `create` path with client, server, and audit logs populated; `CachePlugin` answers a repeat `find` without a second handler hit while `create` is never cached; client and server `DedupePlugin` collapse overlapping `find`s (the server one across two clients); `RetryPlugin` recovers from two `TypeError('Failed to fetch')`; `TimeoutPlugin` turns a slow `find` into a local failure; `NOT_FOUND` reaches `asResult` with `data.id` and is not retried; `CORSPlugin` answers `OPTIONS` preflight with 204 before any procedure runs; and `createLocalClient` runs the same `DedupePlugin`.
