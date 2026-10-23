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

Options: `codec`, `plugins`, `interceptors`, `validation`, and `onError(error, { request, path, context })`. Without `onError`, unknown throws and `INTERNAL` errors are logged with `console.error`; passing it replaces that logging. A JSON object body with keys but no `input` key is `400 BAD_REQUEST`; `{}` and `{"input":null}` still mean no input.

Do not import this package from `@ts-pf/client-http`.
