---
"@ts-pf/client": patch
---

Internal: the event helpers build their context with `defined()` from `@ts-pf/protocol` instead of a conditional spread. `applyPlugins` documents its ordering (plugins first, array order, `[0]` outermost). No behaviour change.
