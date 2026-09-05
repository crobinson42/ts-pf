---
name: ts-pf-client
description: Use when calling a ts-pf contract with createClient, asResult, isLocalFailure, intercept, RetryPlugin, DedupePlugin, or CachePlugin. Triggers: @ts-pf/client, createClient, Link, asResult, CallPlugin.
---

# @ts-pf/client

Typed client over a `Link`. No Fetch.

Install: `npm i @ts-pf/client` (needs `@ts-pf/contract` + `@ts-pf/protocol`)

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { asResult, createClient, DedupePlugin, isLocalFailure, RetryPlugin } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'

const client = createClient<typeof contract>(new FetchLink({ url: '/rpc' }), {
  plugins: [new RetryPlugin(), new DedupePlugin()],
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

Procedure calls take optional `{ signal?: AbortSignal }`. `createClient` options are `{ plugins, interceptors }`. Client-side input validation is off by default. `CachePlugin` needs `ttl` and caches success only. First-party plugins skip `AsyncIterable` input.

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
