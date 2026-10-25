---
"@ts-pf/mcp": patch
---

`all(node, { inject })` reads keys from intersection / `allOf` inputs (TypeBox `Type.Intersect`, Zod record intersections) and record, loose, and catchall inputs, and injected keys are removed from every `allOf` member of the model schema, so the model cannot set them. `all()` throws when `inject` is set and a selected procedure's input has no readable JSON Schema. An `inject` key must be a declared field of some selected input: a record input no longer makes a typo like `tenantID` compile (which left `tenantId` to the model on every other tool), and `all()` throws on such a key at runtime too. For an input that is only a record, use `.inject()` on that tool.
