---
"@ts-pf/protocol": patch
"@ts-pf/client-http": patch
"@ts-pf/mvc-kit": patch
---

`isPFError` now recognises a `PFError` from another installed copy of `@ts-pf/protocol` (version skew, or a bundler that inlined one). Before, such an error failed the check, so `toWireError` sent a typed failure as `INTERNAL` and `FetchLink` wrapped one thrown by a Fetch interceptor as a local failure. `PFError.prototype` carries a non-enumerable `Symbol.for('ts-pf.PFError')` brand; instances gain no own property. `FetchLink` and `bindClient` use the same check.
