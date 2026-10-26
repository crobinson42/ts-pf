# plugins

Call interceptors and `CallPlugin`s on `createClient` / `FetchHandler`, plus a custom plugin on each side. HTTP `HandlerPlugin`s (`CORSPlugin`) stay on `FetchHandler.plugins`, a different list. Timeout is userland (`AbortSignal.timeout` wrapped as `TimeoutPlugin` here); it is not a first-party plugin. So is the GET bridge that makes a read cacheable by a CDN or browser.

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

GET bridge (`src/get-bridge.ts`, `src/get-link.ts`, `planet.find` in `src/contract.ts`):

```ts no-check
find: procedure.meta({ http: { method: 'GET', cacheControl: 'public, max-age=60' } })

new FetchHandler(app, { plugins: [cors, new GetBridgePlugin(app, '/rpc')] })
new FetchLink({ url: '/rpc', interceptors: [getInterceptor(['/rpc/planet/find'])] })
```

The link resends `find` as `GET /rpc/planet/find?input=<JSON>` (keys sorted, POST above 8 KB of URL); the bridge turns it back into the POST `FetchHandler` serves, only for procedures whose contract meta opts in, and sets `Cache-Control` unless the call set its own (`no-store` on errors and on `Set-Cookie`). The GET drops `x-ts-pf-protocol` so a cross-origin read stays a simple request. Opt in reads with no side effects only.

`CallPlugin` is `{ name, intercept }`. Array order only: `[0]` is outermost. `next` may replace `input` / `signal` (and on the server, `context`); it cannot change `path`. Pass `key` so cache/dedupe skip writes (`src/read-key.ts` keys `planet.find` only). Server `DedupePlugin` buckets by the context object `handle()` received; share that object (a db/app handle) if overlapping HTTP reads should join. The same plugin list also runs on `createLocalClient`.

## Run

Build the packages once from the repo root (`npm install && npm run build`), then in this folder:

```sh
npm test
```

## What the smoke test asserts

`tests/smoke.test.ts` runs against an in-process `fetch` that honours `AbortSignal` and checks: the basic `list` / `find` / `create` path with client, server, and audit logs populated; `CachePlugin` answers a repeat `find` without a second handler hit while `create` is never cached; client and server `DedupePlugin` collapse overlapping `find`s (the server one across two clients); `RetryPlugin` recovers from two `TypeError('Failed to fetch')`; `TimeoutPlugin` turns a slow `find` into a local failure; `NOT_FOUND` reaches `asResult` with `data.id` and is not retried; `CORSPlugin` answers `OPTIONS` preflight with 204 before any procedure runs; `find` goes out as a GET with `?input=` and no `x-ts-pf-protocol`, and comes back with `public, max-age=60` while `create` stays POST, and a failed GET carries `no-store`; a per-call `Cache-Control` wins over the meta default and a `Set-Cookie` response is `no-store`; a GET to `planet/create` is 405 without running it; a malformed `?input` is 400 `BAD_REQUEST`; the link keeps long inputs and unlisted paths on POST and sorts object keys; and `createLocalClient` runs the same `DedupePlugin`.
