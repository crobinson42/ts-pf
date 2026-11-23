---
"@ts-pf/mvc-kit": minor
---

`issuesToFieldErrors` now keys each issue by the first segment of its path, the top-level field a `FormModel` knows. Before, a nested issue got a dotted key (`'address.city'`) that `FormModel.setErrors` stored but no field read. The error never showed, and the form stayed invalid until `clearErrors()`. Now `['address', 'city']` lands on `address`, and the first issue per field wins.

New `at` option: `issuesToFieldErrors(issues, { at: ['address'] })` keeps only the issues under that path, keyed relative to it, for the `FormModel` of a nested object or array row (`{ at: ['items', i] }`). New exported type `IssuesToFieldErrorsOptions`.

Breaking for callers that read the dotted keys: map `issues` yourself, or use `at`.
