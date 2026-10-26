---
name: ts-pf-server-http
description: "Use when serving ts-pf over Fetch with FetchHandler, CORSPlugin, RequestLimitPlugin, or request/response header plugins. Triggers: @ts-pf/server-http, FetchHandler, HandlerPlugin, CORSPlugin."
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

`RequestLimitPlugin` rewraps any request with a body (to count its bytes), so the context factory, plugin hooks, and `onError` see a plain `Request`; bodyless requests keep your host's object. Read host extras such as srvx's `request.ip` / `request.runtime` from the request your host passed, typed as srvx's `ServerRequest`: `context: (req) => ({ req, ip: request.ip })`.

A custom `HandlerPlugin` that returns a new request builds it with `new Request(request.url, { method, headers, signal, body, duplex: 'half' })` (cast the init as `RequestInit & { duplex: 'half' }` under DOM types), not `new Request(request, init)`, which throws on srvx's Node request.

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

`FetchHandler` checks the method, then the protocol version, then looks the procedure up, all before it reads the body. A non-POST is `405 METHOD_NOT_ALLOWED`. A request whose `x-ts-pf-protocol` header is present and not `1` (surrounding whitespace ignored) is `400 BAD_REQUEST` `Unsupported protocol version`; a missing header is accepted, so curl and non-ts-pf clients work as before. An unknown path under the prefix is `404 NOT_FOUND`. In all three cases the body is never buffered or decoded, whatever it holds (invalid JSON, a multipart upload, an oversized stream). `RequestLimitPlugin`'s `Content-Length` check runs earlier, in `onRequest`, so a declared oversize body is still `413 PAYLOAD_TOO_LARGE` on any path and for any method; only its streamed-body cap is skipped on a 404 because nothing reads the stream.

A JSON envelope object with keys but no `input` key (`{"id":1}` instead of `{"input":{"id":1}}`) is `400 BAD_REQUEST` `Request body must be {"input": ...}`, whichever codec carries it (plain JSON, the multipart `rpc` part, or a JSONL input line). `{}` and `{"input":null}` still mean no input.

## Cacheable reads and public REST (userland)

The wire is POST only, so a CDN or browser cannot cache a call by URL. When a read needs HTTP caching, bridge it in userland: `HandlerPlugin.onRequest` runs before the method check, so it can turn `GET {prefix}/{path}?input=<JSON>` into the POST `FetchHandler` serves. Opt in per procedure in the contract, and only for procedures with no side effects:

```ts no-check
find: procedure
  .meta({ http: { method: 'GET', cacheControl: 'public, max-age=60' } })
  .input(z.object({ id: z.number() }))

new FetchHandler(app, {
  plugins: [
    new CORSPlugin({ origin }),
    new GetBridgePlugin(app, '/rpc'), // last, so no later onRequest re-wraps its request
  ],
})
```

`GetBridgePlugin` (`examples/plugins/src/get-bridge.ts`, smoke-tested): `lookupProcedure(app, path)` → contract meta `http.method === 'GET'` → `new Request(url, { method: 'POST', headers, body: JSON.stringify({ input: JSON.parse(q) }), signal })`; `onResponse` sets the meta `Cache-Control` on success unless the call already set one, and `no-store` on failures and on any response with `Set-Cookie`. A GET to a procedure that did not opt in falls through to `405 METHOD_NOT_ALLOWED`. The client half is a Fetch `Interceptor` on `FetchLink` that resends the JSON POST for listed paths as a GET with sorted keys and keeps POST above ~8 KB of URL (`examples/plugins/src/get-link.ts`). The GET drops `x-ts-pf-protocol` (absent is accepted) so a cross-origin read stays a simple request.

- `public` only for data that is the same for every caller. A shared-cache hit never reaches the server, so auth middleware does not run for later callers. Per-user reads use `private` (browser cache only). A per-call `Cache-Control` / `Vary` from `ResponseHeadersPlugin` (`context.resHeaders`) wins over the meta default.
- A GET runs from a plain link, cookies included: never opt in a procedure that writes.
- GET is CORS-safelisted, so `CORSPlugin` needs no `allowMethods` change. Your own headers (`Authorization`, custom) still make it preflight, and browsers cache a preflight per URL, so each distinct `?input=` preflights once.
- The wire and the `http` meta key are what a future first-party binding would use, so the bridge can be dropped without touching contracts or URLs.

A public REST API for third parties is a userland router next to `FetchHandler`, calling the same `app` through `createLocalClient` so middleware, validation, and typed errors run:

```ts
import { httpStatus } from '@ts-pf/http'
import { isPFError } from '@ts-pf/protocol'
import { createLocalClient } from '@ts-pf/server'

// GET /v1/planets/:id, routed by your server before handler.handle()
export async function getPlanet(id: string): Promise<Response> {
  const api = createLocalClient(app, { context })
  try {
    return Response.json(await api.planet.find({ id: Number(id) }))
  } catch (error) {
    if (!isPFError(error)) throw error
    return Response.json(
      { code: error.code, message: error.message },
      { status: httpStatus(error) },
    )
  }
}
```

## API

- `FetchHandler`, `FetchHandlerOnError`, `HandleResult`, `HandlerPlugin`
- `CORSPlugin`, `RequestLimitPlugin`, `RequestHeadersPlugin`, `ResponseHeadersPlugin`

## Pair with

- App: `ts-pf-server`
- Client: `ts-pf-client-http`
- Codecs: `ts-pf-file` / `ts-pf-stream` / `ts-pf-sse` via `{ codec }`

## Don't

- Serve REST, OpenAPI, or `catalog.json` from `FetchHandler`. REST routes are userland, beside it.
- Bridge GET for a procedure with side effects, or mark per-user data `public`.
- Port `HandlerPlugin` onto WS / stdio / MessagePort.
- Put file size caps here — those are `MultipartCodec` options.
