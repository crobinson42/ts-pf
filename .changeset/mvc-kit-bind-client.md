---
"@ts-pf/mvc-kit": patch
---

Add `@ts-pf/mvc-kit` with `bindClient` (inject `disposeSignal` on a `ContractClient`) and `issuesToFieldErrors` (VALIDATION issues → `FormModel.setErrors`). Peer `mvc-kit >= 4.9.0`. Does not wrap Resource or React hooks.
