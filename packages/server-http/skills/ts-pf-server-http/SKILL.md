---
name: ts-pf-server-http
description: Use when serving ts-pf over Fetch with FetchHandler, CORSPlugin, RequestLimitPlugin, or request/response header plugins. Triggers: @ts-pf/server-http, FetchHandler, HandlerPlugin, CORSPlugin.
---

# @ts-pf/server-http

`FetchHandler` and HTTP `HandlerPlugin`s. Calls `lookupProcedure` + `runProcedure`.

Install: `npm i @ts-pf/server-http`

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

`plugins` is HTTP-only (`HandlerPlugin`). RPC call interceptors go on `{ interceptors }` from `@ts-pf/server`. `validation` is the same `ProcedureValidation` as `runProcedure`: input checks default on, output and stream output items run only with `{ validation: { output: true } }`. Set it on the constructor, not on `handle()`. `CORSPlugin` answers `OPTIONS` preflight.

## Errors

Unknown throws become `500 INTERNAL` with no stack on the wire. By default `FetchHandler` logs them with `console.error` (the original thrown value, tagged `[ts-pf/server-http]` with the procedure path). It also logs `INTERNAL` `PFError`s — an output schema failure under `validation.output`, invalid declared error `data`, or an explicit `INTERNAL` throw — naming those causes. Declared errors and every other protocol code (`VALIDATION`, `NOT_FOUND`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`) are expected and are not logged.

Pass `onError` to route errors to your own logger. It receives the original error (before `INTERNAL` mapping) for every error response, runs after each `HandlerPlugin.onError`, cannot replace the response (a throw from it rejects `handle()`), and turns the default logging off:

```ts
new FetchHandler(app, {
  onError(error, { request, path, context }) {
    logger.error({ err: error, path: path.join('/'), url: request.url })
  },
})
```

A JSON body with keys but no `input` key (`{"id":1}` instead of `{"input":{"id":1}}`) is `400 BAD_REQUEST` `Request body must be {"input": ...}`. `{}` and `{"input":null}` still mean no input.

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
