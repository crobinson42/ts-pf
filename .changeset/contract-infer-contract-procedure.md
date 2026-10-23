---
"@ts-pf/contract": minor
---

Export `InferContractProcedure<T>` (`{ input, output, errors, meta }` of one procedure type, or `never`) and `IsContractProcedure<T>`. `ContractBuilder` now declares the same phantom `~types` as `ContractProcedure` (a `declare` field; nothing is emitted), so one `ContractProcedure<infer …>` branch reads builders and codegen-written procedures alike. The internal `InferContract*` / `ContractClient` types derive from it and test for "not a procedure" with `[X] extends [never]`.

Observable type change, intended: two builders with different input or output are no longer mutually assignable (they were, because the type parameters only appeared in method return types). `ROUTER_BRAND` (an unused internal constant) is removed from the source; it was never on the package index.
