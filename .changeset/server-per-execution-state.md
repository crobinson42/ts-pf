---
"@ts-pf/server": patch
---

`runProcedure` now builds the `.use()` → input check → `.useAfter()` → handler chain once per `next()` invocation, so a `CallInterceptor` that calls `next()` more than once concurrently (hedging, shadowing, a retry that does not await the first attempt) gives each run its own `input`, `context`, and `signal`. Previously the three were shared closure variables and a second `next({ input })` could overwrite what a still-running first `next()` was about to hand the handler. Interceptors that call `next()` once, or sequentially, behave exactly as before; no wire or public type change.
