# 04 — plugins

HTTP `HandlerPlugin`s, client interceptors, and `AbortSignal`.

**Packages:** `@ts-pf/contract`, `@ts-pf/server`, `@ts-pf/client`, `@ts-pf/protocol`

Procedure middleware cannot see `Request` / `Response`. Plugins are the origin hook: CORS, body limits, header bags.

## Run

```sh
pnpm --filter @ts-pf/example-04-plugins demo
```

Default port `3104`.

## Look at

- `src/server.ts` — `CORSPlugin`, `RequestLimitPlugin`, `RequestHeadersPlugin`, `ResponseHeadersPlugin`
- `src/app.ts` — `context.reqHeaders` / `context.resHeaders` (optional keys from the plugins)
- `src/client.ts` — interceptor attaches `Authorization`; `list({ signal })` forwards abort. `FetchLink` maps local abort/network failures to `INTERNAL` with `status: 0` (not on the wire).

`RequestLimitPlugin` caps the HTTP body. Multipart file caps stay on `MultipartCodec` in [05-files](../05-files).

Browsers will preflight JSON + `x-ts-pf-protocol` (not CORS-safelisted). Without `CORSPlugin`, `OPTIONS` is 405.
