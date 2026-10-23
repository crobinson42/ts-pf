---
"@ts-pf/protocol": minor
---

Add `defined(obj)` and its `Defined<T>` type: a shallow copy of `obj` without the own keys whose value is `undefined`, typed with those keys optional. It is the shared way to forward optional fields under `exactOptionalPropertyTypes` (`{ ...required, ...defined({ signal }) }`) and replaces the per-package `...(x ? { x } : {})` spreads in `@ts-pf/server` and `@ts-pf/client`.
