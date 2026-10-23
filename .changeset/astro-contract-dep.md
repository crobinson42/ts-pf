---
"@ts-pf/astro": patch
---

Declare `@ts-pf/contract` as a dependency. `./server` and `./client` import the `ContractClient` type from it in their published `.d.ts`, so strict / isolated installs (pnpm) no longer fail with TS2307.
