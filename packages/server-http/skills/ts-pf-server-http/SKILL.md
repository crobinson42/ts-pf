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
  // Default key dedupes every unary call, writes included. Pass key to restrict to reads.
  interceptors: applyPlugins([new DedupePlugin({ key: readKey })]),
})

const result = await handler.handle(request, { prefix: '/rpc', context: { db } })
```

Inside your request handler, fall through on a prefix miss:

```ts no-check
if (!result.matched) return new Response('Not Found', { status: 404 })
return result.response
```

`new FetchHandler(app)` infers its context type from `app` (the `$context<C>()` behind `impl.router()`), so `handle(request, { context })` is checked against it and a factory gets `req: Request` for free: `context: (req) => ({ db, req })`. An explicit `new FetchHandler<AppCtx>(app)` still works when `AppCtx` satisfies the app's context. A tree not produced by `impl.router()` infers `unknown`; use `impl.router()`, or pick procedures into a second `impl.router()` call, to keep the check.

`plugins` is HTTP-only (`HandlerPlugin`). RPC call interceptors go on `{ interceptors }` from `@ts-pf/server`. `validation` is the same `ProcedureValidation` as `runProcedure`: input checks default on, output and stream output items run only with `{ validation: { output: true } }`. Set it on the constructor, not on `handle()`. `CORSPlugin` answers `OPTIONS` preflight.

## Errors

Unknown throws become `500 INTERNAL` with no stack on the wire. By default `FetchHandler` logs them with `console.error` (the original thrown value, tagged `[ts-pf/server-http]` with the procedure path). It also logs `INTERNAL` `PFError`s — an output schema failure under `validation.output`, invalid declared error `data`, or an explicit `INTERNAL` throw — naming those causes. Declared errors and every other protocol code (`VALIDATION`, `NOT_FOUND`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`) are expected and are not logged.

Pass `onError` to route errors to your own logger. It receives the original error (before `INTERNAL` mapping) for every error response, runs after each `HandlerPlugin.onError`, cannot replace the response (a throw from it rejects `handle()`), and turns the default logging off:

```ts
import { FetchHandler } from '@ts-pf/server-http'

new FetchHandler(app, {
  onError(error, { request, path, context }) {
    logger.error({ err: error, path: path.join('/'), url: request.url })
  },
})
```

Errors thrown after a streamed response has started (`StreamCodec` / `SseCodec` output) are written in-band by the codec as `INTERNAL` items; they do not reach `onError` or the default log.

`FetchHandler` checks the method, then the protocol version, then looks the procedure up, all before it reads the body. A non-POST is `405 METHOD_NOT_ALLOWED`; a request whose `x-ts-pf-protocol` header is present and not `1` (surrounding whitespace ignored) is `400 BAD_REQUEST` `Unsupported protocol version` — a missing header is accepted, so curl and non-ts-pf clients work as before; and an unknown path under the prefix is `404 NOT_FOUND` whatever the body holds (invalid JSON, a multipart upload, an oversized stream): the body is never buffered or decoded. `RequestLimitPlugin`'s `Content-Length` check runs earlier, in `onRequest`, so a declared oversize body is still `413 PAYLOAD_TOO_LARGE` on any path and for any method; only its streamed-body cap is skipped on a 404 because nothing reads the stream.

A JSON envelope object with keys but no `input` key (`{"id":1}` instead of `{"input":{"id":1}}`) is `400 BAD_REQUEST` `Request body must be {"input": ...}`, whichever codec carries it (plain JSON, the multipart `rpc` part, or a JSONL input line). `{}` and `{"input":null}` still mean no input.

## API

- `FetchHandler`, `FetchHandlerOnError`, `HandleResult`, `HandlerPlugin`
- `CORSPlugin`, `RequestLimitPlugin`, `RequestHeadersPlugin`, `ResponseHeadersPlugin`

## Pair with

- App: `ts-pf-server`
- Client: `ts-pf-client-http`
- Codecs: `ts-pf-file` / `ts-pf-stream` / `ts-pf-sse` via `{ codec }`

## Don't

- Serve REST, OpenAPI, or `catalog.json` from `FetchHandler`.
- Port `HandlerPlugin` onto WS / stdio / MessagePort.
- Put file size caps here — those are `MultipartCodec` options.
