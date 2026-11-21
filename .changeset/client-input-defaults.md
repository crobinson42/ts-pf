---
"@ts-pf/contract": patch
"@ts-pf/server": patch
"@ts-pf/stream": patch
"@ts-pf/swr": patch
---

Type client input with the input schema's input type, so a `.default()` field is optional at the call site (`client.posts.create({ title })`) and a `.transform()` input takes its source type. Handlers and `.useAfter()` still receive the parsed output type. `ContractProcedure` gains a fifth type parameter, `TParsedInput` (defaults to `TInput`, so hand-written and codegen `ContractProcedure<I, O>` types are unchanged), and `InferContractProcedure` returns `parsedInput` beside `input`. `stream(item)` input items follow the same split. `@ts-pf/swr` keys use the caller input type. Type-only: no runtime or wire change.
