---
name: ts-pf-client-http
description: Use when calling ts-pf over Fetch with FetchLink or Fetch Interceptors for headers. Triggers: @ts-pf/client-http, FetchLink, Interceptor.
---

# @ts-pf/client-http

`FetchLink` and Fetch `Interceptor`s. Implements `Link`.

Install: `npm i @ts-pf/client-http`

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

## Errors

On a unary failure the rejected `PFError.status` is the HTTP response status (declared `NOT_FOUND { status: 404 }` → `404`; declared code with no status → `400`). Failures after a stream has started (`StreamCodec` / `SseCodec`) have `status` `undefined`; network / abort failures are `localFailure` (`status: 0`, `local: true`). Switch on `code`.

`FetchLink` sends `x-ts-pf-protocol: 1`. A response whose `x-ts-pf-protocol` is present and not `1` is never decoded: the call rejects with `localFailure('Unsupported protocol version')` (`INTERNAL`, `local: true`, `status: 0`, `cause` is the `Response`). A response without the header that fails to decode is `INTERNAL` with the HTTP status and `Non-RPC response (HTTP …)` (a proxy page, not a ts-pf server); `isLocalFailure` is false for that one.

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
