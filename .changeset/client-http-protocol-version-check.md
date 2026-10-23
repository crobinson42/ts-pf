---
"@ts-pf/client-http": minor
---

`FetchLink` now checks the response `x-ts-pf-protocol` header before decoding. When the header is present and not `1` (surrounding whitespace ignored), the body is not read and the call rejects with `localFailure('Unsupported protocol version', response)` (`INTERNAL`, `local: true`, `status: 0`, `cause` is the `Response`), instead of a misleading codec `BAD_REQUEST` from decoding a foreign envelope. Because it is a local failure, `RetryPlugin`'s default `retry` predicate (`isLocalFailure`) retries it; pass your own `retry` to exclude it. Responses without the header are unchanged (decode; a decode failure is still `INTERNAL` + HTTP status + `Non-RPC response (HTTP …)`), and responses with `x-ts-pf-protocol: 1` are unchanged (decode; codec `PFError`s are rethrown). The request header `FetchLink` sends is unchanged (`x-ts-pf-protocol: 1`).
