---
"@ts-pf/contract": patch
---

Published types no longer import the optional `typebox` peer, so a project can type-check `@ts-pf/contract` with `skipLibCheck` off without installing `typebox`. TypeBox schemas still infer.
