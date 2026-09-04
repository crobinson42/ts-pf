# @ts-pf/server-http

`FetchHandler` and HTTP `HandlerPlugin`s (`CORSPlugin`, `RequestLimitPlugin`, header plugins). Calls `lookupProcedure` + `runProcedure` from [`@ts-pf/server`](../server). Analog of [`@ts-pf/message-server`](../message-server).

```ts
import { createImplementer } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'

const handler = new FetchHandler(app)
const result = await handler.handle(request, { prefix: '/rpc', context: { db } })
```

Do not import this package from `@ts-pf/client-http`.
