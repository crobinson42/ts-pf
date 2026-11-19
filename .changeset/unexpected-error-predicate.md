---
"@ts-pf/protocol": minor
"@ts-pf/server-http": patch
"@ts-pf/mcp": patch
---

Add `isUnexpectedError(error)` to `@ts-pf/protocol`: `true` for any value that is not a `PFError` and for a `PFError` whose code is `INTERNAL`. It is the filter `FetchHandler` and `@ts-pf/mcp` use for their default `console.error` logging (now implemented with it; behaviour unchanged), so a custom `onError` can keep the same filter: `onError: (e) => { if (isUnexpectedError(e)) logger.error(e) }`.
