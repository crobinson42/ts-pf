---
"@ts-pf/server-http": minor
---

`FetchHandler` now reads the request `x-ts-pf-protocol` header. A missing header is accepted as before (curl, non-ts-pf clients). A header equal to `1` (surrounding whitespace ignored) is accepted. Any other value (`2`, `1.0`, an empty string, …) answers `400 BAD_REQUEST` with message `Unsupported protocol version` — the same code and string the message handshake uses — without reading the body. The check runs after the method check and before the procedure lookup, so a non-POST is still `405` whatever the header says, and the error reaches `HandlerPlugin.onError` and the `onError` option like every other pre-call failure. The response still carries `x-ts-pf-protocol: 1`.

Behavior change: a client that sends a malformed `x-ts-pf-protocol` value (for example `1.0`) was previously served as v1 and is now rejected with 400. No shipped ts-pf client sends such a value; `FetchLink` sends exactly `1`.
