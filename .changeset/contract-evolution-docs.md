---
"@ts-pf/server": patch
"@ts-pf/contract": patch
---

Docs: evolving a contract and a domain error catalog recipe.

- `@ts-pf/server`: the README and skill add a domain error catalog recipe to "Mapping domain errors": a code → message catalog owned by the domain layer, a status map where `null` means "not exposed to clients" (sent as `INTERNAL`), the client-facing error map derived from it for `procedure.errors()`, and a shared mapping middleware typed with `MiddlewareFn` that leaves non-domain errors unchanged and relies on the declared `status` being filled in.
- `@ts-pf/contract`: the hub skill links the new "Evolving a contract" guide (safe vs breaking changes, catch-all branches for new error codes and enum values, deprecation, shared vs per-procedure error maps, catalog diffs in CI).
