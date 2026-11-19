---
"@ts-pf/server": minor
"@ts-pf/docs": minor
"@ts-pf/server-http": patch
"@ts-pf/message-client": patch
"@ts-pf/contract": patch
---

Server and catalog DX improvements.

- `@ts-pf/server`: add `mapStreamErrors(value, fn)`. Wraps an async iterable so a throw during iteration is replaced by `fn(error)`, and returns any other value unchanged, so one `.use()` middleware can map domain errors to declared codes for unary and stream procedures alike (`return mapStreamErrors(await next(), mapError)`). Mapped errors still get the declared-error `data` check. The README and skill also document that middleware `next()` must be called at most once (use a `CallInterceptor` for retries), that the handler `signal` may be absent for in-process callers, and an auth-middleware-plus-narrowing-helper pattern for context keys middleware adds.
- `@ts-pf/docs`: `docs('…')` is shorthand for `docs({ description: '…' })`. `catalog(contract, { requireDescription: true })` throws an error listing every catalog procedure without a `docs()` description or summary (default `false`).
- `@ts-pf/server-http`: document that a `HandlerPlugin.onRequest` that throws a `PFError` is answered through the normal error path, e.g. `NOT_FOUND` for a procedure that should not be served over HTTP.
- `@ts-pf/message-client`: the skill notes that a drain stall is always `INTERNAL` with a fixed message, distinct from app-defined error codes.
- `@ts-pf/contract`: the hub skill shows the `docs('…')` shorthand.
