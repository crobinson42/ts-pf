---
"@ts-pf/openapi": minor
---

The default `openapi()` output changes so code generators get one model per type. It still describes the same POST JSON RPC (same paths, envelopes, and operations), but component names and schema details differ:

- Root `$defs` are hoisted: a `.meta({ id: 'Book' })` schema becomes `components.schemas.Book` and every `$ref` points there, so a DTO used by several procedures is one component instead of a copy under each `<path>.Input` / `<path>.Output`. Those per-procedure components remain; one that is just a named type is now a `$ref` to it. When an id's input and output shapes differ (for example a field with a default), the output keeps `Book` and the input is `BookInput`. Two different shapes for one id on the same side, an `<id>Input` that is already an id, or an id that equals another component name now throws, naming the id. Zod's unnamed recursive defs (`__schema0`, …) become `<host>.__schemaN`.
- Declared errors are shared per code: when every procedure that declares a code has the same `data` shape (or none), operations reference one `Error.<CODE>` (and `Error.<CODE>.Data`) instead of `<path>.Error.<CODE>`. Codes whose data differs keep the per-procedure names.
- Output and error `data` schemas (including the protocol `VALIDATION` data) no longer carry `additionalProperties: false`, so a server that adds a field does not break older generated clients. Input schemas and the protocol envelopes are unchanged.
- Component schemas no longer carry a nested `$schema`; the document's `jsonSchemaDialect` declares the dialect.

If you post-process the document by component name (for example `planet.find.Error.NOT_FOUND`, or `$defs` under a procedure's component), update it to the new names.
