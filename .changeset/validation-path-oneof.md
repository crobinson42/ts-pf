---
"@ts-pf/docs": patch
---

The `VALIDATION` protocol error's data schema in `catalog()` now describes `issues[].path` items as `oneOf: [{ type: 'string' }, { type: 'number' }]` instead of a JSON Schema `type` array, which some OpenAPI tools and code generators do not read. The wire is unchanged; catalog and `openapi()` output (and so `catalogHash()`) change.
