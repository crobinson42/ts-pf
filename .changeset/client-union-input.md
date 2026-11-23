---
"@ts-pf/contract": patch
"@ts-pf/swr": patch
---

Typed clients now accept a union input. Before, a procedure whose input schema is a union (`z.union`, `z.discriminatedUnion`) gave a call signature that no input could satisfy (`Type 'string' is not assignable to type 'never'`). This affected every client built on `ContractClient`, including `createClient` and `createAstroClient`. The input type now stays one union. An input that accepts `undefined` (`.optional()`, `z.unknown()`, `z.any()`) can now be left out: `client.x()`.

- `@ts-pf/contract`: `ProcedureClient` keeps a union input as one parameter type, and makes the input optional when it accepts `undefined`.
- `@ts-pf/swr`: `key()` accepts a union input, and takes no argument when the input accepts `undefined`.
