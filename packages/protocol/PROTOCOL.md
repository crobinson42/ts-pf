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

After a stream starts, HTTP status stays 200; the same `{ ok: false, error }` object appears as a JSONL line, SSE `event: error`, or a message-transport `{ "type": "result", "ok": false, "error": … }` frame. Switch on `code`, not HTTP status.

TypeScript `PFError`, `instanceof`, and `asResult` are JS conveniences. They are not required to consume the API. Any HTTP client parses this envelope.

Contract-declared error codes use the status on the error definition.

The TypeScript FetchLink maps **local** failures to `INTERNAL` with `status: 0`. That status is not on the wire and is not a protocol status. Abort uses message `Request aborted`. Network throws keep `error.message` and set `Error.cause` to the thrown value (Node’s `ECONNREFUSED` is then `error.cause.cause`). HTTP responses **without** `x-ts-pf-protocol` that fail `decodeResponse` become `INTERNAL` with the HTTP status and message `Non-RPC response (HTTP …)` — do not surface codec `BAD_REQUEST` 400 for proxy HTML. Codec `PFError` is rethrown only when `x-ts-pf-protocol` is present (truncated JSONL/SSE at decode time, malformed ts-pf JSON). `toJSON()` still omits `status` and `cause`.

## Versioning

Header `x-ts-pf-protocol` is `1`. JSON is the default content type and the envelope above does not change for JSON calls. Other content types are codec-defined (see [Binary attachments](#binary-attachments-optional), [Message streams](#message-streams-optional), and [SSE](#sse-optional)). A codec may stream the HTTP body (`ReadableStream`) without changing this envelope. Optional [message transports](#message-transports-optional) carry the same version as `v: 1` on `hello` instead of this header. Bump the header only if the JSON contract breaks.

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

## Message transports (optional)

JSON-HTTP clients can ignore this section. The same RPC runs over WebSocket, stdio, or MessagePort as multiplexed JSON **text** frames. Envelope keys inside those frames stay `{ "input" }`, `{ "ok": true, "output" }`, and `{ "ok": false, "error": { "code", "message", "data?" } }`. The discriminator is still `error.code`.

These bindings are not HTTP:

- Files / `multipart/form-data` are Fetch-only. See [Binary attachments](#binary-attachments-optional). Do not invent a binary attachment framing here.
- SSE (`text/event-stream`) is Fetch-only. See [SSE](#sse-optional). Do not send SSE over a socket.
- HTTP status is Fetch-only. It is not a field on a frame.
- `METHOD_NOT_ALLOWED` is Fetch-only. There is no HTTP method on a frame.
- Procedure-declared `.errors()` `status` is Fetch-only. Every client, including TypeScript, switches on `error.code`.

`v: 1` on `hello` / `hello-ok` is the same protocol version as header `x-ts-pf-protocol: 1`. Different carrier, same number.

### Framing

Logical frames are compact JSON objects. All three bindings send **JSON text**. Pretty-printed JSON is forbidden (`JSON.stringify` of a compact object never emits a raw unescaped newline, so NDJSON is safe).

| Binding | Byte / message framing |
|---|---|
| WebSocket | One JSON string per WebSocket **text** message. Binary frames: close with no parse. Close code `1002`. |
| MessagePort | One JSON string per `postMessage`. Not structured clone of the object. Non-string data: close with no parse. |
| stdio | Newline-delimited compact JSON (NDJSON). One object per `\n`. Empty lines ignored. Trailing partial line on EOF: if `trim()` is non-empty, treat it as a complete frame; if it fails decode, close. |

### Frame types

| `type` | Allowed keys | Required |
|---|---|---|
| `hello` | `type`, `v`, `meta` | `v` |
| `hello-ok` | `type`, `v` | `v` |
| `hello-error` | `type`, `error` | `error` |
| `call` | `type`, `id`, `path`, `input`, `stream` | `id`, `path` |
| `result` | `type`, `id`, `ok`, `output`, `error` | `id`, `ok` |
| `cancel` | `type`, `id` | `id` |
| `item` | `type`, `id`, `output` | `id` |
| `done` | `type`, `id` | `id` |
| `in-item` | `type`, `id`, `input` | `id` |
| `in-done` | `type`, `id` | `id` |

A present key that is not in the allow-list is invalid. Missing a required field is invalid. Include a decoded `id` on a decode failure only when it is already a non-empty string.

| Field | Rule |
|---|---|
| `id` | Non-empty string. `"1"` is fine; `1` (number) is invalid; `""` is invalid. A client *may* use a decimal counter. A server **must not** `Number(id)`. After a terminal frame, the same string may be reused for a new call. |
| `path` | Array of strings (may be empty). Not `"planet/find"`. A non-string element is invalid. |
| `v` | JSON number `1`. `"1"` is invalid. `1.5` is invalid. |
| `ok` | Boolean. Required on `result`. |
| `stream` | Literal `true` or omitted. `false`, `1`, `"true"` are invalid. |
| `input` on `call` | Omitted or `null` means no input (same as JSON HTTP). Any other JSON value is the input. **Invalid if `stream` is `true` and `input` is present** (including `null`). |
| `output` on `result` with `ok: true` | Optional. Omitted ⇒ `undefined`. Must not be present when `ok: false`. |
| `error` on `result` | Required when `ok: false`. Must not be present when `ok: true`. |
| `error` object | Keys only `code`, `message`, `data?`. `code` is a non-empty string. `message` is a string (may be empty). Extra keys on `error` are invalid. No `status`. No `cause`. |
| Extra keys on a known `type` | Invalid. |
| `meta` on `hello` | Any JSON value, untrusted. Omit when the client did not send it. |

Omit `input` / `output` / `data` / `meta` / `stream` when they have no value. Never send JSON `undefined`. Void procedures therefore emit `{"type":"result","id":"1","ok":true}`. Receivers treat omitted `output` as `undefined`.

### Handshake

HTTP equivalent of header `x-ts-pf-protocol: 1`. Hello is not a `call` and has no `id`.

```json
{ "type": "hello", "v": 1 }
{ "type": "hello", "v": 1, "meta": { "token": "…" } }
{ "type": "hello-ok", "v": 1 }
{ "type": "hello-error", "error": { "code": "BAD_REQUEST", "message": "Unsupported protocol version" } }
```

**Server connection states:** `waiting-hello` → `ready` → `closed`.

**Order is locked:** valid hello → server accepts it (may await a per-connection context factory) → `hello-ok`. The server stays in `waiting-hello` until that accept settles. Do **not** buffer `call` frames during the wait. A well-behaved client does not send `call` until `hello-ok`. A `call` during `waiting-hello` is `Expected hello` then close.

`waiting-hello` inbound:

1. Inbound over-limit / binary / non-string / `JSON.parse` throw / parsed value is not a non-array object → **close with no frame**.
2. Else `JSON.parse` produced an object. Validate it as a frame.
3. Branch:

| Condition | Action |
|---|---|
| Valid `hello` with `v === 1`, and this is the **first** hello | Stay `waiting-hello`. Accept the hello (context factory, if any). **Success:** send `{ "type": "hello-ok", "v": 1 }`, go `ready`, then and only then deliver **later** frames. **Throw:** send `{ "type": "hello-error", "error": { "code": "INTERNAL", "message": "Internal server error" } }` (no stack, no factory message) and close. Do not send `hello-ok`. |
| Valid `hello` with `v !== 1` | `{ "type": "hello-error", "error": { "code": "BAD_REQUEST", "message": "Unsupported protocol version" } }` then close. |
| Any other object, **including** a decode failure (`v: "1"`, extra keys, missing `v`, `type: "call"`, …) and including frames that arrive **while accept is outstanding** | `{ "type": "hello-error", "error": { "code": "BAD_REQUEST", "message": "Expected hello" } }` then close. If the decoded type is `hello` (invalid `v`, extra keys, …), the message is `Invalid hello` instead. If accept is in flight, **abandon** it (ignore its later settle; do not send `hello-ok` if it succeeds after close). |

Optional hello timeout (TypeScript default `10_000` ms; `0` = none): if still `waiting-hello` when the timer fires (including during accept), close with no frame, abandon accept.

**Client connection states:** `connecting` → `handshaking` → `ready` → `closed`.

The client sends `hello` as soon as the duplex is open. `call` waits for `ready`.

| Received while `handshaking` | Action |
|---|---|
| Valid `hello-ok` `v === 1` | Become `ready`. |
| Valid `hello-error` | Fail the connect with that `error` (typically `BAD_REQUEST` / `INTERNAL`, not status 0). Close. |
| Anything else parsed | Fail the connect as a local `Invalid response`. Close. |
| Unparseable / close / timeout | Fail the connect as a local `Network error` or `Connection closed`. |

On hello timeout: local `Network error`, then close. Callers who disable the timeout must abort via `AbortSignal` or close the connection.

### Multiplex

**At most one terminal frame per id.** Terminal frames are:

- `{ "type": "result", … }` (unary success, unary / application / protocol error, or mid-stream error)
- `{ "type": "done", "id" }` (successful output-stream EOF)

After a terminal frame, the id is free for reuse. Until then:

| Event | Action |
|---|---|
| Duplicate `call` for an in-flight id | **Ignore.** Do not emit `result` on that id. Do not replace the running call. Do not close the connection (other ids must survive a buggy peer). Well-behaved clients never reuse an in-flight id. |
| Unknown / invalid frame whose `id` is in-flight | **Ignore.** Do not settle that call. Do not send a second `result`. |
| Unknown / invalid frame whose `id` is a non-empty string **not** in-flight | Send `{ "type": "result", "id", "ok": false, "error": { "code": "BAD_REQUEST", "message": "…" } }`. That *is* the terminal frame for a call that never started. |
| Unknown / invalid frame with no usable id, **after `ready`** | Close. No `hello-error` (handshake is over). |
| `JSON.parse` throw, non-object, non-string WS/port payload, binary WS frame, inbound over-limit | **Always close.** No id extraction, no regex, no partial parse. **Exception in `waiting-hello` only:** if `JSON.parse` succeeded as an object, send `hello-error` `BAD_REQUEST` then close (even when the object is not a valid frame). |

A hostile peer cannot cancel an in-flight call by reusing its id or sending `{ "type": "nope", "id" }`. They can still send `{ "type": "cancel", "id" }` — that is the documented cancel path.

The connection keeps reading frames while a call runs. Two in-flight ids complete independently.

### Size limits

Option omitted = **unlimited in both directions** (same as Fetch without a request-limit plugin).

**Inbound** (every received string / stdio line buffer):

1. Measure UTF-8 byte length.
2. If a max is set and `length` exceeds it → **close**. Do not `JSON.parse`. Do not extract an id. Do not send `PAYLOAD_TOO_LARGE`.
3. For stdio: if the *unterminated* line buffer exceeds the max before `\n` → close, drop the buffer.

**Outbound** is what peers see. `PAYLOAD_TOO_LARGE` is the protocol code reused from HTTP 413; the HTTP meaning does not apply on this transport. Do not leak serializer messages (`Do not know how to serialize a BigInt`) onto the wire.

| Intended outbound frame | If it cannot be sent (oversize or cannot stringify) |
|---|---|
| `result` / `item` / `done` for an **open** id, whether or not items have started | Peer sees `{ "type": "result", "id", "ok": false, "error": { "code": "PAYLOAD_TOO_LARGE", "message": "Frame too large" } }` (oversize) or `{ "type": "result", "id", "ok": false, "error": { "code": "INTERNAL", "message": "Internal server error" } }` (stringify). Then stop. **No `done`.** If that error frame also cannot be sent → close. |
| `hello` / `hello-ok` / `hello-error` / `cancel` / `call` / `in-item` / `in-done` | No substitute frame. A client `call` that cannot be sent fails that call with `PAYLOAD_TOO_LARGE` (413) or `INTERNAL` (stringify; `isLocalFailure` is false for 413). A hello that cannot be sent fails connect as local `Network error`, then close. |

### Unary call

```json
{ "type": "call", "id": "1", "path": ["planet", "find"], "input": { "id": 1 } }
{ "type": "result", "id": "1", "ok": true, "output": { "id": 1, "name": "Earth" } }
{ "type": "result", "id": "1", "ok": false, "error": { "code": "NOT_FOUND", "message": "...", "data": { "id": 1 } } }
{ "type": "cancel", "id": "1" }
```

- Unknown path → `NOT_FOUND` (same as Fetch after a prefix match).
- `METHOD_NOT_ALLOWED` is not used.
- `cancel` of an unknown / already-finished id is a no-op.

Sequence: `C: call` then `S: result ok:true | result ok:false`. Optional: `C: cancel` after `call` and before the terminal. After cancel, the server stops; no further frames for this id.

HTTP distinguishes unary vs stream via `Content-Type`. Message frames have no content type. The client uses the **first inbound frame for that id**.

#### First frame (client)

After sending `call` (and while possibly sending `in-item` / `in-done` if `call.stream === true`), wait for the first inbound frame with this `id`:

| First frame | Client action |
|---|---|
| `result` `ok: true` | Resolve to `output` (possibly `undefined`). Unary done. |
| `result` `ok: false` | Reject with that `error`. |
| `item` | Resolve to an async iterable whose first `next()` yields this `output`; then continue in `streaming-out`. |
| `done` | Resolve to an async iterable that immediately completes (empty stream; JSONL uses EOF, multiplex cannot). |
| `cancel` / `call` / `hello*` / `in-item` / `in-done` | Reject this call as local `Invalid response`. Do not close the connection. Ignore further frames for this id. |
| Peer close before any frame | Reject as local `Connection closed`. |

The call promise is not itself async-iterable. For output streams it **resolves to** an async iterable (same DX as JSONL: `const tokens = await client.planet.chat(...)` then `for await`).

#### `streaming-out` (after the promise resolved to an async iterable)

Further frames drive the **iterator**, not the call promise.

| Event | Action |
|---|---|
| `item` | Yield `output` (omitted → `undefined`). |
| `done` | Complete the iterator. |
| `result` `ok: false` | **Reject the iterator** with that `error`. This is the legal mid-stream error, **not** the “in-flight → ignore” rule. No `done`. |
| `result` `ok: true` / unknown type / extra `done` / `item` after `done` | Illegal. **Ignore** (do not close the connection; do not reject a second time). Well-behaved servers never send these. |
| Peer close / client close | Reject the iterator as local `Connection closed` if not already done. |
| User `break` / iterator `return()` / `throw()` | Send `{ "type": "cancel", "id" }` (not `in-done`, not `done`). Stop reading frames for this id. The server sees `cancel` and stops emitting. |

`for-await` `break` and iterator `return()` are the Fetch-body-cancel equivalent.

#### Input-stream send path

| Event | Action |
|---|---|
| Input is an async iterable | Send `call` with `"stream": true` and **no** `input`. Then pull the generator: each yield → `in-item`; normal completion → `in-done`. Start immediately; do not wait for a server frame. |
| Input generator **throws** or `return()` before normal completion | Send `{ "type": "cancel", "id" }` (**not** `in-done`). Throw is not a successful close. Stop sending `in-item`. |
| Any **terminal** inbound frame (`result` or `done`) or local cancel | **Stop** sending `in-item` / `in-done`. The server ignores late `in-*` after a terminal. |
| Server `result` before client `in-done` | Legal (the procedure does not wait for EOF). Client stops `in-item`. |

#### Legal sequences

**Unary** (no `stream` on `call`, output is a value):

```
C: call
S: result ok:true | result ok:false
```

**Output-only stream** (`call` without `stream`, output is an async iterable):

```
C: call
S: item*  done
   | item*  result ok:false     // mid-stream error; NO done
   | result ok:false            // failed before the first item (still a result, not item)
```

Empty successful stream: `done` with zero `item`s.

**Input-only stream** (`call.stream: true`, output is a value):

```
C: call stream:true
C: in-item*  in-done
S: result ok:true | result ok:false
```

`in-item` / `in-done` may be sent immediately after `call`. The server starts the procedure with an async-iterable input as soon as `call` is accepted (does not wait for `in-done`).

**Duplex** (input stream + output stream). `in-item` and `item` **interleave** on one id:

```
C: call stream:true
C: in-item*
S: item*
C: in-item* / in-done
S: item* / done | result ok:false
```

**Illegal** (peer must not send; receiver: if the id is in-flight **and this is not a legal `streaming-out` `result ok: false`**, **ignore**; if this is the first frame, `Invalid response` / `BAD_REQUEST` as in the first-frame table):

- `result ok: true` after an `item` or `done`
- `item` or `done` after a unary `result`
- `item` after `done`
- `done` after `result ok: false`
- `done` after `done`
- second `result` of any kind
- `call.stream: true` together with `input`
- `stream: false` / `stream: 1`
- `in-item` after `in-done`
- second `in-done`
- `in-item` or `in-done` for an id whose `call` did not have `stream: true`

Late frames after a terminal (including after client cancel) are ignored. They do not close the connection.

### Output streams

```json
{ "type": "item", "id": "1", "output": { "token": "Hel" } }
{ "type": "item", "id": "1", "output": { "token": "lo" } }
{ "type": "done", "id": "1" }
```

Mid-stream failure: `{ "type": "result", "id": "1", "ok": false, "error": { … } }` then stop. **Do not send `done` after error.** Same as JSONL (failure line, then EOF) and SSE (no `close` after `error`).

Nested streams and `File` / `Blob` values inside items are `BAD_REQUEST`.

### Input streams

```json
{ "type": "call", "id": "1", "path": ["planet", "ingest"], "stream": true }
{ "type": "in-item", "id": "1", "input": { "chunk": 1 } }
{ "type": "in-done", "id": "1" }
```

The server must accept `in-item` for that id as soon as `call` is accepted (the next-turn item must not be lost). Backpressure is implicit (JS queue / pipe buffer). No credit-based flow control in v1. Cancel of the call aborts both sides.

### Cancel and mid-stream errors

**No frames for this id after cancel or after a terminal frame.** A late procedure completion must not send.

| Catch | Action |
|---|---|
| Declared / protocol `error` from the procedure or from a stream `next()` | Send `{ "type": "result", "id", "ok": false, "error": { "code", "message", "data?" } }`. Declared codes survive. Status is **not** on the wire. Do not send `done`. If already cancelled, send nothing. |
| Unknown throw | `{ "type": "result", "id", "ok": false, "error": { "code": "INTERNAL", "message": "Internal server error" } }`. If cancelled, still invoke any local error hook, send nothing. |
| Abort after client `cancel` (generator checks `signal` and throws `AbortError`) | Send **nothing**. Prefer silence. Do not encode `INTERNAL`. |
| Client abort while **in flight** (a `call` was sent) | Send `{ "type": "cancel", "id" }`. Reject local as `Request aborted`. Ignore late `result` / `item` / `done`. |
| Client abort **before hello-ok** (no id yet) | Local `Request aborted`. Do **not** send `cancel`. Do **not** close the connection unless hello itself failed (timeout / `hello-error` / peer close). Other `call`s may still wait for the same `ready`. |
| Output-stream cancel (iterator `return()` / `throw()` / `AbortSignal`) | Client sends `{ "type": "cancel", "id" }` (not `in-done`). Server aborts, stops emitting, ends any input queue. |
| Input generator throw / early `return()` | Client sends `{ "type": "cancel", "id" }` (not `in-done`). Same server cancel path. |

### Local failure vs protocol failure

The TypeScript client maps **local** failures (never got a protocol result) to `INTERNAL` with `status: 0`. That status is a TypeScript client convention, **not** a protocol status, and is **not** on the wire. Do not add it to the [protocol errors](#protocol-errors) status table.

`examples/02-errors` still distinguishes three ways:

1. `isLocalFailure` (status 0) — never got a protocol result
2. `error.code` — declared / protocol codes from the envelope
3. `INTERNAL` with **non-zero** status — protocol `INTERNAL`

Declared `.errors()` `status` is Fetch-only. Mid-stream Fetch JSONL keeps HTTP 200; a message-transport protocol `INTERNAL` reconstructs as 500. That is OK (no HTTP). Do not copy `status: 200`.

| Event | TypeScript `PFError` | `isLocalFailure` |
|---|---|---|
| `AbortSignal` while a `call` is in flight | `INTERNAL`, status `0`, message `Request aborted`, `cause` set; send `{ "type": "cancel", "id" }` | true |
| `AbortSignal` while waiting on `ready` (no id) | `INTERNAL`, status `0`, message `Request aborted`, `cause` set; no `cancel`; connection stays up | true |
| Peer disconnect mid-call | `INTERNAL`, status `0`, message `Connection closed`, `cause` set | true |
| Hello timeout / connect fail / hello stringify fail | `INTERNAL`, status `0`, message `Network error`, `cause` set; close | true |
| Malformed frame from peer with no usable id (connection closes) | Inflight: `INTERNAL`, status `0`, message `Invalid response` or `Connection closed`, `cause` set | true |
| First frame for an id is illegal | `INTERNAL`, status `0`, message `Invalid response`; that call only | true |
| Protocol `result` `{ "ok": false, "error" }` | code / message / data from the envelope; status from the table below or 400 | false |
| `NOT_FOUND` / `VALIDATION` / `BAD_REQUEST` from the server | as envelope | false |
| Version mismatch `hello-error` | `BAD_REQUEST` from the envelope (if received) or status `0` if the connection closed first | depends |
| Client refused to send oversize / could not stringify a `call` | `PAYLOAD_TOO_LARGE` 413 or `INTERNAL` (stringify) | false |

Status reconstruction on protocol results (no HTTP status on the frame). TypeScript clients use this so `PFError.status` matches the Fetch table; non-JS clients ignore it and switch on `error.code`:

| `error.code` | Reconstructed status |
|---|---|
| `BAD_REQUEST` | 400 |
| `VALIDATION` | 422 |
| `NOT_FOUND` | 404 |
| `INTERNAL` | 500 |
| `METHOD_NOT_ALLOWED` | 405 (unused on this transport; still reconstructed so one table) |
| `PAYLOAD_TOO_LARGE` | 413 |
| any other (application) code | 400 |

