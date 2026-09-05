# @ts-pf/server-http

`FetchHandler` and HTTP `HandlerPlugin`s (`CORSPlugin`, `RequestLimitPlugin`, header plugins). Calls `lookupProcedure` + `runProcedure` from [`@ts-pf/server`](../server). Analog of [`@ts-pf/message-server`](../message-server).

Agent skill: [`skills/ts-pf-server-http/`](skills/ts-pf-server-http/). Sync with `npx skills experimental_sync -y`.

`plugins` is HTTP-only. RPC call interceptors (`CallInterceptor` from `@ts-pf/server`) go on `{ interceptors }` — use `applyPlugins` to install `CallPlugin`s such as `DedupePlugin`.

```ts
import { applyPlugins, DedupePlugin } from '@ts-pf/server'
import { CORSPlugin, FetchHandler } from '@ts-pf/server-http'

const handler = new FetchHandler(app, {
  plugins: [new CORSPlugin()],
  interceptors: applyPlugins([new DedupePlugin()]),
})
const result = await handler.handle(request, { prefix: '/rpc', context: { db } })
```

Do not import this package from `@ts-pf/client-http`.
