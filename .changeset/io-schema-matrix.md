---
"@ts-pf/docs": patch
"@ts-pf/codegen": patch
"@ts-pf/openapi": patch
---

Stress-test input/output JSON Schema through `catalog()` → `emit()` / `openapi()`. Hoist OpenAPI inner schemas so recursive `$ref`s resolve, print TypeBox records and catchall index signatures as valid TypeScript, and treat non-JSON TypeBox `type`s as unavailable.
