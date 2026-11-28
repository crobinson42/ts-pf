---
"@ts-pf/astro": patch
---

`createAstroHandler` now hands the context function to `FetchHandler`, which resolves it inside its pipeline, as it does any context factory. A `PFError` thrown by the context function (`UNAUTHORIZED` / 401, `FORBIDDEN` / 403) is now the encoded error response instead of escaping to Astro as a 500; any other throw is `INTERNAL` and reaches `FetchHandler`'s `onError`.

Behavior you may notice: the context function runs only for a POST to a known procedure whose body decoded, so it no longer runs (nor its side effects, such as a session touch) for prefix misses, CORS preflights, 405s, 400s, or unknown procedures; a malformed body is now a 400 `BAD_REQUEST` before an auth refusal; and the body is consumed by then, so a context function that read `request.clone()` must move that check to a `HandlerPlugin.onRequest`. `createAstroLocalClient` is unchanged: a throw from its context function rejects the call.
