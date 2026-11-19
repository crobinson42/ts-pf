---
"@ts-pf/server": minor
---

A `PFError` thrown with a code the procedure declares on `.errors()` now gets the declared `status` when it has none, the same as `errors.CODE()`. Previously `throw new PFError({ code: 'Conflict' })` for a declared `{ Conflict: { status: 409 } }` was answered with HTTP 400. The finalized error keeps the thrown error's `cause`; an explicit `status` is kept, `message` is not filled, and undeclared codes are untouched. `status` is still transport metadata and never on the wire.
