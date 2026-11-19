---
"@ts-pf/docs": minor
"@ts-pf/codegen": patch
---

`@ts-pf/docs` exports `canonicalize(value)`, a copy of a JSON value with every object's keys sorted, so `JSON.stringify` of the result is byte-stable. `catalogHash()` in `@ts-pf/codegen` now hashes `canonicalize(catalog)` from `@ts-pf/docs` instead of a private copy; hash values are unchanged.
