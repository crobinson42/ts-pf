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

Options: `codec`, `plugins`, `interceptors`, `validation`, and `onError(error, { request, path, context })` (type `FetchHandlerOnError`). Without `onError`, unknown throws and `INTERNAL` errors are logged with `console.error`; passing it replaces that logging, and `isUnexpectedError` from `@ts-pf/protocol` keeps the same filter: `onError: (e) => { if (isUnexpectedError(e)) logger.error(e) }`. Mid-stream errors are in-band codec items and reach neither. A JSON envelope object with keys but no `input` key is `400 BAD_REQUEST` from the codec; `{}` and `{"input":null}` still mean no input. A request `x-ts-pf-protocol` header that is present and not `1` is `400 BAD_REQUEST` `Unsupported protocol version` before the body is read; a missing header is accepted. `RequestLimitPlugin` rewraps any request with a body, so the context factory and plugin hooks see a plain `Request`; read host extras (srvx `request.ip`) from the request your host passed.

A `HandlerPlugin.onRequest` that throws answers like any protocol error: the throw takes the normal error path (`HandlerPlugin.onError`, the `onError` option or the default log, the JSON envelope with `x-ts-pf-protocol` and `httpStatus(error)`, then `onResponse`). There is no `filter` option; to keep a procedure off HTTP while another transport still serves it, throw `NOT_FOUND`:

```ts
import { PFError } from '@ts-pf/protocol'
import { FetchHandler, type HandlerPlugin } from '@ts-pf/server-http'

// `admin.*` is served over a message transport only; over HTTP it looks unknown.
const hideAdmin: HandlerPlugin = {
  name: 'hide-admin',
  onRequest({ request }) {
    if (new URL(request.url).pathname.startsWith('/rpc/admin/')) {
      throw new PFError({ code: 'NOT_FOUND', message: 'Procedure not found' })
    }
    return undefined
  },
}

new FetchHandler(app, { plugins: [hideAdmin] })
```

Do not import this package from `@ts-pf/client-http`.

## API

- `FetchHandler`, `FetchHandlerOnError`, `HandleResult`, `HandlerPlugin`
- `CORSPlugin`, `RequestLimitPlugin`, `RequestHeadersPlugin`, `ResponseHeadersPlugin`
