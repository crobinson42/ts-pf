---
name: ts-pf-client-http
description: Use when calling ts-pf over Fetch with FetchLink or Fetch Interceptors for headers. Triggers: @ts-pf/client-http, FetchLink, Interceptor.
---

# @ts-pf/client-http

`FetchLink` and Fetch `Interceptor`s. Implements `Link`.

Install: `npm i @ts-pf/client-http@beta`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { createClient, RetryPlugin } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'

const client = createClient<typeof contract>(
  new FetchLink({
    url: '/rpc',
    interceptors: [
      async ({ request, next }) => {
        request.headers.set('x-trace', '1')
        return next(request)
      },
    ],
  }),
  { plugins: [new RetryPlugin()] },
)
```

Fetch interceptors see raw `Request` / `Response` / fetch throws, not mapped `PFError`. Retry, cache, and dedupe belong on `createClient`.

## API

- `FetchLink`
- `Interceptor`

## Pair with

- Client: `ts-pf-client`
- Server: `ts-pf-server-http`
- Codecs: `ts-pf-file` / `ts-pf-stream` / `ts-pf-sse` via `{ codec }`

## Don't

- Retry / cache / dedupe here (`RetryPlugin` / `DedupePlugin` / `CachePlugin` on `createClient`).
- `isLocalFailure` inside Fetch interceptors.
