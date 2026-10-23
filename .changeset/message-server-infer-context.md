---
"@ts-pf/message-server": minor
---

`new PortHandler(app)`, `new WsHandler(app)`, and `new StdioHandler(app)` infer `TCtx` from the app's context brand (the `$context<C>()` type behind `impl.router()`), so `bind(..., { context })` is checked against it, for a value or a `(info) => ctx` factory. An explicit `new PortHandler<AppCtx>(app)` is still accepted when `AppCtx` satisfies the app's context. A tree not produced by `impl.router()` infers `TCtx = unknown` (only the router-level brand is read); an implementer that never called `$context()` brands `object`, so a non-object `context` is rejected.

Previously compiling code that can stop compiling, intended: `bind(..., { context })` with a value or factory result that does not satisfy `$context<C>()`, and an explicit generic narrower than the app's context.
