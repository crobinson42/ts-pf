---
"@ts-pf/mcp": patch
---

`all(node, { inject })` reads keys from intersection / `allOf` inputs (TypeBox `Type.Intersect`, Zod record intersections) and record, loose, and catchall inputs, and injected keys are removed from every `allOf` member of the model schema, so the model cannot set them. `all()` throws when `inject` is set and a selected procedure's input has no readable JSON Schema.
