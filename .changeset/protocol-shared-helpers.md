---
"@ts-pf/protocol": minor
---

Two new exports for codecs and transport adapters, so the transports stop re-implementing them:

- `toWireError(error)` returns the `error` object of a failure envelope for any thrown value: a `PFError` gives its `toJSON()` (`{ code, message, data? }`, never `status` / `cause` / `local`); anything else gives the fixed `{ code: 'INTERNAL', message: 'Internal server error' }` with no stack and no message leak. Log the original value at the site; this is the wire form only.
- `isAsyncIterable(value)` is the shared "is this a stream" predicate: a non-null object or function whose `Symbol.asyncIterator` is a function. Nothing is excluded — a `ReadableStream` counts on Node and modern browsers — so a site that must treat one as bytes writes that exclusion itself.
