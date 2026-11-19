---
"@ts-pf/contract": minor
"@ts-pf/server": minor
"@ts-pf/mcp": patch
---

Export the pieces of the built-in input-validation failure for handlers that validate themselves (for example under `validation: { input: false }`): `toValidationIssues(issues)` from `@ts-pf/contract` turns Standard Schema issues into `ValidationIssue[]` with the same path normalization the built-in adapter applies, and `validationError(issues)` from `@ts-pf/server` builds the same `VALIDATION` `PFError` the input check throws. `runProcedure` and `@ts-pf/mcp` now build that error with `validationError` (output unchanged). The docs note that with `validation.input: false` the handler's `input` is the raw value although its type says parsed.
