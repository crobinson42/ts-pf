# @ts-pf/client-http

`FetchLink` and Fetch `Interceptor`s. Implements `Link` from [`@ts-pf/client`](../client). Analog of [`@ts-pf/message-client`](../message-client).

```ts
import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'

const client = createClient<typeof contract>(new FetchLink({ url: '/rpc' }))
```

Do not import this package from `@ts-pf/server-http` (prod).
