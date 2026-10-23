---
"@ts-pf/client": minor
---

`createClient<T = never>(link, options?)`: when the contract type argument is omitted and cannot be inferred from a `ContractClient<typeof contract>` annotation, the result is `{ readonly '~error': 'Pass createClient<typeof contract>(link)' }` instead of `ContractClient<unknown>` (an empty `{}` whose first property access failed far from the cause). `createClient<typeof contract>(link)`, `createClient<Contract>(link)` from codegen output, and `const client: ContractClient<typeof contract> = createClient(link)` are unchanged.

Previously compiling code that can stop compiling, intended: an un-annotated `createClient(link)` whose result was assigned to a wider type such as `unknown` or `object`, or passed where `{}` was accepted.
