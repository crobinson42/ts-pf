# 03 — middleware

`$context`, `.use()` / `.useAfter()`, and `createLocalClient` (in-process, no HTTP).

**Packages:** `@ts-pf/contract`, `@ts-pf/server`, `@ts-pf/client`, `@ts-pf/protocol`

## Run

```sh
pnpm --filter @ts-pf/example-03-middleware demo
```

Default port `3103`. `pnpm --filter @ts-pf/example-03-middleware local` skips HTTP.

`.use()` runs **before** input validation (`input` is `unknown`). `.useAfter()` runs after, with typed input. `$context<C>()` is the source of context types — middleware runtime-merges keys and does not infer them.

`createLocalClient(app, { context })` runs procedure middleware → validate → handler. No `HandlerPlugin`, no codec, no HTTP.

## Look at

- `src/app.ts` — `impl.middleware` + `impl.use(requireUser)` for the authed tree; `list` stays on the public implementer. `.useAfter` logs typed `input.name`
- `src/local.ts` — same `app`, no server
- `src/server.ts` — HTTP context factory maps `Authorization: Bearer demo` → `user`

Next: [04-plugins](../04-plugins) moves request headers out of the context factory and into `RequestHeadersPlugin`.
