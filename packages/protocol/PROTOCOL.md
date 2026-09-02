# ts-pf RPC Protocol v1

Portable HTTP RPC. JSON by default. Implementable from TypeScript, Kotlin, Swift, or any HTTP client.

## Request

```
POST {prefix}/{procedure.path}
Content-Type: application/json
x-ts-pf-protocol: 1

{ "input": { "id": 1 } }
```

Procedure path is the nested router keys joined by `/`. Example: `planet.find` → `/rpc/planet/find` when the prefix is `/rpc`.

Procedures with no input may omit `input` or send `null`.

v1 accepts **POST only**. Other methods return HTTP 405 with `error.code: "METHOD_NOT_ALLOWED"`.

## Success

```
HTTP 200
Content-Type: application/json
x-ts-pf-protocol: 1

{ "ok": true, "output": { "id": 1, "name": "Earth" } }
```

## Failure

```
HTTP 4xx/5xx
Content-Type: application/json
x-ts-pf-protocol: 1

{ "ok": false, "error": { "code": "NOT_FOUND", "message": "...", "data": { "id": 1 } } }
```

## Protocol errors

| Code | Status | When |
|---|---|---|
| `BAD_REQUEST` | 400 | Invalid JSON or envelope |
| `VALIDATION` | 422 | Input schema failed. `error.data.issues` is `{ message, path }[]` |
| `NOT_FOUND` | 404 | Prefix matched, procedure missing |
| `METHOD_NOT_ALLOWED` | 405 | Non-POST |
| `PAYLOAD_TOO_LARGE` | 413 | Request body larger than the configured handler limit |
| `INTERNAL` | 500 | Unknown throw. Output schema failures also use 500 (server bug). |

The discriminator is `error.code`. HTTP status is unary transport only; it is not in the JSON body.

The table above is a **closed** set. Procedure-declared codes are application-defined strings with optional `data`. `VALIDATION` is the only protocol code with a specified `data` shape: `{ issues: { message, path }[] }` where `path` is `(string | number)[]`. Other protocol codes omit `data`. `INTERNAL` never includes a stack or output-schema issues.

Unknown `code` values are valid JSON; clients must catch-all. A procedure may reuse `NOT_FOUND` for a missing entity. Do not redeclare `VALIDATION`, `INTERNAL`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, or `PAYLOAD_TOO_LARGE`.

After a stream starts, HTTP status stays 200; the same `{ ok: false, error }` object appears as a JSONL line or SSE `event: error`. Switch on `code`, not HTTP status.

TypeScript `PFError`, `instanceof`, and `asResult` are JS conveniences. They are not required to consume the API. Any HTTP client parses this envelope.

Contract-declared error codes use the status on the error definition.

The TypeScript FetchLink maps **local** failures to `INTERNAL` with `status: 0`. That status is not on the wire and is not a protocol status. Abort uses message `Request aborted`. Network throws keep `error.message` and set `Error.cause` to the thrown value (Node’s `ECONNREFUSED` is then `error.cause.cause`). HTTP responses **without** `x-ts-pf-protocol` that fail `decodeResponse` become `INTERNAL` with the HTTP status and message `Non-RPC response (HTTP …)` — do not surface codec `BAD_REQUEST` 400 for proxy HTML. Codec `PFError` is rethrown only when `x-ts-pf-protocol` is present (truncated JSONL/SSE at decode time, malformed ts-pf JSON). `toJSON()` still omits `status` and `cause`.

## Versioning

Header `x-ts-pf-protocol` is `1`. JSON is the default content type and the envelope above does not change for JSON calls. Other content types are codec-defined (see [Binary attachments](#binary-attachments-optional), [Message streams](#message-streams-optional), and [SSE](#sse-optional)). A codec may stream the HTTP body (`ReadableStream`) without changing this envelope. Bump the header only if the JSON contract breaks.

## Binary attachments (optional)

JSON-only clients can ignore this section. The envelope keys stay `{ "input" }`, `{ "ok": true, "output" }`, and `{ "ok": false, "error" }`. Files are extra HTTP parts, not a different RPC.

| Condition | Content-Type | Body |
|---|---|---|
| No files in the value tree | `application/json` | Envelope above |
| One or more `File`/`Blob` values | `multipart/form-data` | Envelope in part `rpc` plus numbered file parts |
| Any failure | `application/json` | Failure envelope above |

A server that accepts multipart must still accept `application/json` so existing JSON clients keep working.

### Multipart request

```
POST {prefix}/{procedure.path}
Content-Type: multipart/form-data; boundary=----ts-pf
x-ts-pf-protocol: 1

------ts-pf
Content-Disposition: form-data; name="rpc"
Content-Type: application/json

{"input":{"name":"Earth","photo":{"$pf":"file","id":"0"}}}
------ts-pf
Content-Disposition: form-data; name="0"; filename="earth.png"
Content-Type: image/png

<bytes>
------ts-pf--
```

- Part `rpc` is the JSON envelope. There is no sibling `files` / `maps` field.
- File parts are named with decimal ids `"0"`, `"1"`, … matching the placeholder `id`.
- `filename` is the portable name (strip path segments). Unnamed blobs may use `blob`.
- Part `Content-Type` is the MIME type (`application/octet-stream` if omitted).
- Part order is not significant. Missing or extra file parts are `BAD_REQUEST`.
- `{ "$pf": "file", "id": "..." }` in a JSON-only body is `BAD_REQUEST`. `$pf` is reserved when using this content type.

Root-level file input:

```json
{"input":{"$pf":"file","id":"0"}}
```

Success responses use the same framing; part `rpc` is `{ "ok": true, "output": ... }`.

```bash
curl -X POST "$HOST/rpc/planet/create" \
  -H "x-ts-pf-protocol: 1" \
  -F 'rpc={"input":{"name":"Earth","photo":{"$pf":"file","id":"0"}}};type=application/json' \
  -F '0=@earth.png;type=image/png'
```

## Message streams (optional)

JSON-only clients can ignore this section. A **root** `AsyncIterable` (async generator) is a sequence of the same envelopes, one compact JSON value per line.

| Condition | Content-Type | Body |
|---|---|---|
| No stream | `application/json` | Envelope above |
| Root stream input or output | `application/jsonl` | One envelope per line |
| Failure **before** the stream starts | `application/json` | Failure envelope above |
| Failure **after** the stream starts | `application/jsonl` | `{ "ok": false, "error": … }` line, then EOF |

HTTP status for an accepted stream is **200**. Status cannot change after the first byte; later errors are in-band. Nested streams and file values inside stream items are `BAD_REQUEST`.

Output:

Streamed bodies (JSONL and SSE) SHOULD send `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`. `FetchHandler` sets these when the codec body is a `ReadableStream`.

```
HTTP/1.1 200
Content-Type: application/jsonl
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
x-ts-pf-protocol: 1

{"ok":true,"output":{"token":"Hel"}}
{"ok":true,"output":{"token":"lo"}}
```

Input (the procedure input **is** the stream):

```
POST {prefix}/{procedure.path}
Content-Type: application/jsonl
x-ts-pf-protocol: 1

{"input":{"chunk":1}}
{"input":{"chunk":2}}
```

EOF is a successful close. There is no `done` field on the envelope.

`text/event-stream` is optional output framing of these same lines. See [SSE](#sse-optional). Do not bump `x-ts-pf-protocol` for that framing.

```bash
# JSON input, JSONL output
curl -N -X POST "$HOST/rpc/chat" \
  -H "x-ts-pf-protocol: 1" \
  -H "content-type: application/json" \
  -d '{"input":{"prompt":"hi"}}'

# JSONL input
curl -N -X POST "$HOST/rpc/ingest" \
  -H "x-ts-pf-protocol: 1" \
  -H "content-type: application/jsonl" \
  --data-binary $'{"input":{"chunk":1}}\n{"input":{"chunk":2}}\n'
```

## SSE (optional)

JSON-only clients can ignore this section. SSE is **output-only** framing of the same envelopes as [message streams](#message-streams-optional). Input streams stay `application/jsonl`. Request `Content-Type: text/event-stream` is `BAD_REQUEST`.

| Condition | Content-Type |
|---|---|
| Unary / pre-stream failure | `application/json` |
| Root stream input | `application/jsonl` |
| Root stream output | `text/event-stream` |

```
HTTP/1.1 200
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
x-ts-pf-protocol: 1

:

event: message
data: {"ok":true,"output":{"token":"Hel"}}

event: message
data: {"ok":true,"output":{"token":"lo"}}

event: close

```

Mid-stream failure (HTTP already 200):

```
event: error
data: {"ok":false,"error":{"code":"INTERNAL","message":"upstream died"}}

```

Then the body ends. Do not send `close` after `error`.

| SSE `event` | Meaning | `data` |
|---|---|---|
| `message` | yield | success envelope (one compact JSON line) |
| `error` | in-band failure, then stop | failure envelope |
| `close` | successful EOF | none. Framing only — not an envelope |
| comment (`:`) | keepalive / header flush | n/a |

`data:` JSON is byte-identical to a JSONL line. Close is an explicit event so a truncated TCP close is not success; EOF without `close` after the stream started is `INTERNAL`. Comments may be sent immediately (to flush headers) and periodically (~15s) to defeat idle proxies. No `id:` or `retry:` in v1.

The TypeScript client parses `fetch` response bodies. Native `EventSource` is not an RPC client (GET-only, no custom headers, auto-reconnects).

```bash
curl -N -X POST "$HOST/rpc/chat" \
  -H "x-ts-pf-protocol: 1" \
  -H "content-type: application/json" \
  -d '{"input":{"prompt":"hi"}}'
# response: text/event-stream
```

