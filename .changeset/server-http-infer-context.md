---
"@ts-pf/server-http": minor
---

`new FetchHandler(app)` infers `TCtx` from the app's context brand (the `$context<C>()` type behind `impl.router()`), so `handle(request, { context })` is checked against it and a `context` factory gets `req: Request` without an annotation: `context: (req) => ({ db, req })` compiles with no implicit `any`. An explicit `new FetchHandler<AppCtx>(app)` is still accepted when `AppCtx` satisfies the app's context. A hand-built tree has no brand and keeps `TCtx = unknown`.

Previously compiling code that can stop compiling, intended: `handle(request, { context })` with a value or factory result that does not satisfy `$context<C>()` (for example `{ wrong: 1 }`, or a missing required key), and an explicit generic narrower than the app's context (`new FetchHandler<{ db: Db }>(app)` when the app needs `{ db, req }`).
