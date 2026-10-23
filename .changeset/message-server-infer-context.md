---
"@ts-pf/message-server": minor
---

`new PortHandler(app)`, `new WsHandler(app)`, and `new StdioHandler(app)` infer `TCtx` from the app's context brand (the `$context<C>()` type behind `impl.router()`), so `bind(..., { context })` is checked against it, for a value or a `(info) => ctx` factory. An explicit `new PortHandler<AppCtx>(app)` is still accepted when `AppCtx` satisfies the app's context. A hand-built tree has no brand and keeps `TCtx = unknown`.

Previously compiling code that can stop compiling, intended: `bind(..., { context })` with a value or factory result that does not satisfy `$context<C>()`, and an explicit generic narrower than the app's context.
