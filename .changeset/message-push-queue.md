---
"@ts-pf/message": minor
"@ts-pf/message-server": patch
"@ts-pf/message-client": patch
---

`@ts-pf/message` exports `createPushQueue()` / `PushQueue<T>`: the push-to-`AsyncIterable` queue both message adapters use to turn frames into a stream (`push(value)`, one-shot `end()` or `fail(error)`, one pending `next()` at a time). Custom `Duplex` bindings can use the same primitive. `localFailure` is still re-exported for compatibility but is now `@deprecated` — import it from `@ts-pf/protocol`.

`@ts-pf/message-server` and `@ts-pf/message-client`: no behaviour change. Both drop their private (and drifted) `push-queue.ts` copies for the shared one. `@ts-pf/message-client` now depends on `@ts-pf/protocol` directly (as `message-server` already did) and uses its `isPFError`, `localFailure`, and `isAsyncIterable` instead of a duck-typed `PFError` check and a local predicate copy; the mapped errors are the same objects as before.
