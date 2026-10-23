---
"@ts-pf/protocol": minor
---

Add `defined(obj)` and its `Defined<T>` type: a shallow copy of `obj` without the own keys whose value is `undefined`, typed with those keys optional. It is the shared way to forward optional fields under `exactOptionalPropertyTypes` at construction-time option boundaries (`{ ...required, ...defined({ signal }) }`). Per-call hot paths assign optional keys directly instead (see `npm run bench`).
