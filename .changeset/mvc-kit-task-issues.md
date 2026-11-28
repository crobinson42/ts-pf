---
"@ts-pf/mvc-kit": minor
---

Add `taskIssues(task)`: the `VALIDATION` issues behind a failed mvc-kit task, for `issuesToFieldErrors`. A tracked method can let the call throw, and a View or caller fills the form from the task once it has settled: `issuesToFieldErrors(taskIssues(vm.async.submit))`. It returns `[]` unless `task.cause` is a `PFError` with code `VALIDATION` (from any copy of `@ts-pf/protocol`); the code itself is already `task.errorCode`. mvc-kit updates the task after the method's promise settles, so it cannot be read inside the method that threw.

`@ts-pf/mvc-kit` now depends on `@ts-pf/protocol`, and `bindClient` uses its `isPFError` instead of a local copy of the brand check. No practical behavior change for `bindClient`: every 1.x `PFError` carries the brand.
