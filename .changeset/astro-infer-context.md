---
"@ts-pf/astro": minor
---

`createAstroHandler(handler, { context })` checks `context` against the `TCtx` the `FetchHandler` inferred from the app, and `createAstroLocalClient(app, Astro, context)` checks it against the app's `$context<C>()` type (both use `NoInfer`, so the context value no longer widens the inferred type). `createAstroClient<T = never>({ prefix })` follows the `createClient` rule: without `<typeof contract>` the result is `{ readonly '~error': 'Pass createAstroClient<typeof contract>({ prefix })' }` instead of an empty client; a `ContractClient<typeof contract>` annotation on the variable or return type still supplies `T`.

Previously compiling code that can stop compiling, intended: a `context` value or factory result that does not satisfy the app's `$context<C>()`, and member access on an un-annotated `createAstroClient({ prefix })` result (which was `{}` before).
