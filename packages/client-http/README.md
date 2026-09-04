# @ts-pf/client-http

`FetchLink` and Fetch `Interceptor`s. Implements `Link` from [`@ts-pf/client`](../client). Analog of [`@ts-pf/message-client`](../message-client).

Fetch interceptors wrap `Request` / `Response` inside `FetchLink` (headers, raw HTTP). They do not see structured RPC input or mapped `PFError`. Retry, cache, and in-flight dedupe belong on `createClient` as call interceptors / `CallPlugin`s (`RetryPlugin`, `DedupePlugin`, `CachePlugin`).

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

Do not import this package from `@ts-pf/server-http` (prod).
