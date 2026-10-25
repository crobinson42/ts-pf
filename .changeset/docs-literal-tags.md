---
"@ts-pf/docs": patch
---

`docs()` keeps `tags` and `hidden` as literal types in its return type (other fields stay `DocsMeta`), so `@ts-pf/mcp` can filter on them in types. Runtime output is unchanged.
