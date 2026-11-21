---
"@ts-pf/contract": minor
"@ts-pf/swr": minor
"@ts-pf/docs": minor
"@ts-pf/codegen": minor
"@ts-pf/openapi": minor
---

Expandable outputs. `procedure.input(I).output(Wide).expand({ key: 'populate', at?: ['docs'], fields: { authorId: User } })` makes a procedure's output type follow a list in its input. `client.posts.get({ id, populate: ['authorId'] })` returns `authorId` as `User`; without the list it is the plain id type. This works on every client (`createClient`, `createLocalClient`, swr, mvc-kit, astro, and codegen output) with no wrapper. `.output()` stays the wide schema, so the wire and the server do not change.

- `@ts-pf/contract`: `.expand()`, the `Expansion<Key, At, Fields>` type (the hand-writable 6th `ContractProcedure` parameter; `Fields` are output types), `InferExpandedOutput<T, P>`, and `ContractExpandDef`. `InferContractProcedure` gains `expand`, and `ProcedureClient` gains an optional 4th parameter.
- `@ts-pf/swr`: the callable and `.call` narrow. `key` / `fetcher` / `mutator` stay wide; annotate those with `InferExpandedOutput`.
- `@ts-pf/docs`: `CatalogProcedure.expand` (`CatalogExpand`).
- `@ts-pf/codegen`: `emit` / `emitFiles` print the `Expansion` argument. `diffCatalog` reports `expand-*` changes (a removal is breaking; an addition is safe).
- `@ts-pf/openapi`: `x-ts-pf-expand: { key, at, fields }` on the operation.
