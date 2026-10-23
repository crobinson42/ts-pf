---
"@ts-pf/protocol": minor
"@ts-pf/contract": minor
"@ts-pf/http": minor
"@ts-pf/server": minor
"@ts-pf/message": minor
"@ts-pf/stream": minor
"@ts-pf/sse": minor
"@ts-pf/client": patch
"@ts-pf/client-http": patch
"@ts-pf/message-client": patch
"@ts-pf/mvc-kit": patch
---

`status` on errors is now honest: it is optional transport metadata with no default, set only where a transport really has one.

**Type change (may stop existing code compiling).** `PFError.status` and `PFErrorInit.status` are `number | undefined` (`@ts-pf/protocol`), and every `ClientError` variant — so `asResult(...).error.status` too — is `status?: number` (`@ts-pf/contract`, surfaced through `@ts-pf/client`). Code that used `status` as a plain number (`err.status.toFixed()`, `err.status >= 500`, passing it to a `number` parameter) needs `?? 400` or a guard. Code that compares `err.status === 404` still compiles but was already only right over HTTP; switch on `err.code` instead.

**Runtime values per transport, before → after:**

| Transport | before | after |
|---|---|---|
| HTTP unary failure (`FetchLink`) | HTTP response status | unchanged: HTTP response status |
| HTTP after a stream started (`StreamCodec` JSONL line, `SseCodec` `event: error`, `Stream truncated`, `Invalid error event`) | `200` | `undefined` |
| WebSocket / stdio / MessagePort (`errorFromEnvelope`) | `400` | `undefined` |
| Local failure (`localFailure`) | `0` + `local: true` | unchanged |
| In-process (`createLocalClient`, `errors.CODE()` with no declared `status`) | `400` | `undefined` |
| In-process, declared `{ status: 404 }` | `404` | unchanged |
| `new PFError({ code })` with no `status` | `400` | `undefined` |

**Server-side HTTP responses are unchanged.** `httpStatus()` in `@ts-pf/http` now owns the HTTP default: protocol codes map to `PROTOCOL_HTTP_STATUS`, any other code uses `error.status ?? 400`. A declared error with `status: 404` is still HTTP 404; a declared error with no `status` is still HTTP 400. `httpStatus()` no longer special-cases `local: true` (it returned `0`, which is not a valid `Response.status`; a server never sees a local failure, and one would now map to `INTERNAL` → 500). `createErrorFactory` stamps a declared `ErrorDef.status` and nothing when the definition omits one. `toJSON()` and the wire envelope are unchanged: `{ code, message, data? }`, never `status`.

**`@ts-pf/mvc-kit`:** mvc-kit classifies a thrown value by `code` only when `status` is a finite number, so `bindClient` now hands mvc-kit a copy of the `PFError` with `status: 400` whenever the transport did not carry one (message links, mid-stream failures, declared errors without `status`). `errorCode` stays the `PFError.code` on every `Link`; the original error is not mutated, and HTTP failures and `localFailure` (`status: 0`) pass through as-is. `bindClient` calls therefore return a chained promise rather than the link's own promise object.
