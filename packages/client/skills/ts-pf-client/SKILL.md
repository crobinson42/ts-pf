---
name: ts-pf-client
description: "Use when calling a ts-pf contract with createClient, asResult, isLocalFailure, intercept, RetryPlugin, DedupePlugin, or CachePlugin. Triggers: @ts-pf/client, createClient, Link, asResult, CallPlugin."
---

# @ts-pf/client

Typed client over a `Link`. No Fetch.

Install: `npm i @ts-pf/client` (needs `@ts-pf/contract` + `@ts-pf/protocol`)

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { asResult, createClient, DedupePlugin, isLocalFailure, RetryPlugin } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'

// Dedupe reads only. The default key covers every unary call, writes included.
const readKey = ({ path, input }: { path: string[]; input: unknown }) =>
  path.join('.') === 'planet.find' ? JSON.stringify([path, input]) : undefined

const client = createClient<typeof contract>(new FetchLink({ url: '/rpc' }), {
  plugins: [new RetryPlugin(), new DedupePlugin({ key: readKey })],
})

const planet = await client.planet.find({ id: 1 })

const result = await asResult(client.planet.find({ id: 1 }))
if (!result.ok) {
  if (isLocalFailure(result.error)) {
    // never reached the server (local === true)
  } else if (result.error.code === 'NOT_FOUND') {
    result.error.data.id
  }
}
```

## Errors

`result.error` (and a thrown `PFError`) is `{ code, message, data?, status? }`. Switch on `code`. `status` is optional transport metadata and means something different per `Link`:

| Link | `status` |
|---|---|
| `FetchLink`, unary failure | HTTP response status (declared `{ status: 404 }` → `404`, declared with no status → `400`, protocol codes → their HTTP table) |
| `FetchLink`, after a stream started (JSONL / SSE) | `undefined` |
| `PortLink` / `WsLink` / `StdioLink` | `undefined` |
| Local failure (`isLocalFailure`) | `0` |
| `createLocalClient` (server package) | declared `ErrorDef.status` or `undefined` |

`if (err.status === 404)` is only right over HTTP; write `if (err.code === 'NOT_FOUND')`. Arithmetic or `.toFixed()` on `status` needs `?? 400` or a guard.

`createClient` needs the contract type: `createClient<typeof contract>(link)`, or a `ContractClient<typeof contract>` annotation on the variable or return type. Without either the result is `{ readonly '~error': 'Pass createClient<typeof contract>(link)' }`, not an empty client. Procedure calls take optional `{ signal?: AbortSignal }`. `createClient` options are `{ plugins, interceptors }`. Client-side input validation is off by default. `CachePlugin` needs `ttl` and caches success only. First-party plugins skip `AsyncIterable` input.

`DedupePlugin` and `CachePlugin` default key is `JSON.stringify([path, input])` for every unary call, mutations included — two concurrent `planet.create({ name })` calls share one request and one result. Pass `key` and return `undefined` for anything that is not a read (same `readKey` works for both; runnable form `examples/plugins/src/read-key.ts`). `RetryPlugin` retries local failures (not aborts) up to 3 times; a connection dropped after send is a local failure too, so pass `retry` to exclude non-idempotent writes.

## API

- `createClient`, `Link`, `intercept`
- `asResult`, `CallResult`, `isLocalFailure`
- `RetryPlugin`, `DedupePlugin`, `CachePlugin`, `applyPlugins`, `CallPlugin`, `CallInterceptor`
- `onStart` / `onSuccess` / `onError` / `onFinish`

## Pair with

- HTTP: `ts-pf-client-http` (`FetchLink`)
- Message: `ts-pf-message-client`
- SWR / mvc-kit: `ts-pf-swr` / `ts-pf-mvc-kit`

## Don't

- `FetchLink` or Fetch `Interceptor` from this package.
- Import `@ts-pf/server` from client modules.
- Widen `asResult` to `CallResult<T, E | PFError>`.
- Retry/cache on `FetchLink` — use `RetryPlugin` / `CachePlugin` here.
- Bare `new DedupePlugin()` / `new CachePlugin({ ttl })` in front of writes — pass `key`.
