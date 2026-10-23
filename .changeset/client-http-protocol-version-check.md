---
"@ts-pf/client-http": minor
---

`FetchLink` now checks the response `x-ts-pf-protocol` header before decoding. When the header is present and not `1` (surrounding whitespace ignored), the body is not read and the call rejects with a `PFError` shaped like the existing non-RPC decode failure: `code: 'INTERNAL'`, `status` = the HTTP response status, message `Unsupported protocol version (x-ts-pf-protocol: <value>)`, `cause` = the `Response`. It is not a local failure (`isLocalFailure` is false — the response demonstrably came from a server), so `RetryPlugin`'s default predicate does not retry it. Responses without the header are unchanged (decode; a decode failure is still `INTERNAL` + HTTP status + `Non-RPC response (HTTP …)`), and responses with `x-ts-pf-protocol: 1` are unchanged (decode; codec `PFError`s are rethrown). The request header `FetchLink` sends is unchanged (`x-ts-pf-protocol: 1`).
