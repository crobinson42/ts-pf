---
name: ts-pf-server-http
description: Use when serving ts-pf over Fetch with FetchHandler, CORSPlugin, RequestLimitPlugin, or request/response header plugins. Triggers: @ts-pf/server-http, FetchHandler, HandlerPlugin, CORSPlugin.
---

# @ts-pf/server-http

`FetchHandler` and HTTP `HandlerPlugin`s. Calls `lookupProcedure` + `runProcedure`.

Install: `npm i @ts-pf/server-http@beta`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { applyPlugins, DedupePlugin } from '@ts-pf/server'
import { CORSPlugin, FetchHandler, RequestLimitPlugin } from '@ts-pf/server-http'

const handler = new FetchHandler(app, {
  plugins: [
    new CORSPlugin({ origin: ['https://app.example.com'] }),
    new RequestLimitPlugin({ maxBodySize: 1024 * 1024 }),
  ],
  interceptors: applyPlugins([new DedupePlugin()]),
})

const result = await handler.handle(request, { prefix: '/rpc', context: { db } })
if (!result.matched) return new Response('Not Found', { status: 404 })
return result.response
```

`plugins` is HTTP-only (`HandlerPlugin`). RPC call interceptors go on `{ interceptors }` from `@ts-pf/server`. `CORSPlugin` answers `OPTIONS` preflight.

## API

- `FetchHandler`, `HandleResult`, `HandlerPlugin`
- `CORSPlugin`, `RequestLimitPlugin`, `RequestHeadersPlugin`, `ResponseHeadersPlugin`

## Pair with

- App: `ts-pf-server`
- Client: `ts-pf-client-http`
- Codecs: `ts-pf-file` / `ts-pf-stream` / `ts-pf-sse` via `{ codec }`

## Don't

- Serve REST, OpenAPI, or `catalog.json` from `FetchHandler`.
- Port `HandlerPlugin` onto WS / stdio / MessagePort.
- Put file size caps here — those are `MultipartCodec` options.
