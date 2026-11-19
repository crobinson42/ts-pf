---
"@ts-pf/codegen": minor
---

Add `diffCatalog(previous, next)` and `ts-pf-codegen diff <previous.json> <next.json> [--json]`: a breaking-change check over two `catalog()` documents. Inputs are compared as what old clients send; outputs and error `data` as what they receive. Adding an output field, enum value, union variant, or error code is safe. `diff` exits 2 when there is a breaking change, so CI can fail on it. New exports: `diffCatalog`, `CatalogDiff`, `CatalogChange`.
