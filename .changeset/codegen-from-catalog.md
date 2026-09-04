---
"@ts-pf/codegen": patch
"@ts-pf/docs": patch
"@ts-pf/openapi": patch
"@ts-pf/swr": patch
---

Add `@ts-pf/codegen` to print a nested `Contract` `.d.ts` from `catalog()` for split-repo `createClient<Contract>`. Catalog docs cover OpenAPI and codegen projections; OpenAPI README points typed clients at codegen; SWR notes generated `Contract` works with `createSwr`.
