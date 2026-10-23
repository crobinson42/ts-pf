---
"@ts-pf/server-http": patch
---

Internal: `FetchHandler.handle()` is split into named private steps that mirror the call pipeline (`onRequest` plugins, method check, lookup, decode, context + `onContext`, run, encode, error reporting, `onResponse`). No behaviour change: `METHOD_NOT_ALLOWED` still throws inside the pipeline so plugins and `onError` see it, and the `onError` / default-logging rules are unchanged.
