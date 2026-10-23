# @ts-pf/server-http

`FetchHandler` and HTTP `HandlerPlugin`s (`CORSPlugin`, `RequestLimitPlugin`, header plugins). Calls `lookupProcedure` + `runProcedure` from [`@ts-pf/server`](../server). Analog of [`@ts-pf/message-server`](../message-server).

Agent skill: [`skills/ts-pf-server-http/`](skills/ts-pf-server-http/). Sync with `npx skills experimental_sync -y`.

`plugins` is HTTP-only. RPC call interceptors (`CallInterceptor` from `@ts-pf/server`) go on `{ interceptors }` — use `applyPlugins` to install `CallPlugin`s such as `DedupePlugin`.

```ts
import { applyPlugins, DedupePlugin } from '@ts-pf/server'
import { CORSPlugin, FetchHandler } from '@ts-pf/server-http'

const handler = new FetchHandler(app, {
  plugins: [new CORSPlugin()],
  // Default key dedupes every unary call, writes included. Pass key to restrict to reads.
  interceptors: applyPlugins([new DedupePlugin({ key: readKey })]),
})
const result = await handler.handle(request, { prefix: '/rpc', context: { db } })
```

Options: `codec`, `plugins`, `interceptors`, `validation`, and `onError(error, { request, path, context })` (type `FetchHandlerOnError`). Without `onError`, unknown throws and `INTERNAL` errors are logged with `console.error`; passing it replaces that logging. Mid-stream errors are in-band codec items and reach neither. A JSON envelope object with keys but no `input` key is `400 BAD_REQUEST` from the codec; `{}` and `{"input":null}` still mean no input. A request `x-ts-pf-protocol` header that is present and not `1` is `400 BAD_REQUEST` `Unsupported protocol version` before the body is read; a missing header is accepted.

Do not import this package from `@ts-pf/client-http`.

## API

- `FetchHandler`, `FetchHandlerOnError`, `HandleResult`, `HandlerPlugin`
- `CORSPlugin`, `RequestLimitPlugin`, `RequestHeadersPlugin`, `ResponseHeadersPlugin`
