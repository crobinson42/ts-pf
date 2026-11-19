# ts-pf RPC Protocol 1 (revision 1.2)

Canonical JSON envelope language for ts-pf. Same `{ "input" }`, `{ "ok": true, "output" }`, `{ "ok": false, "error": { "code", "message", "data?" } }` on every pipe. Discriminator is `error.code`. Implementable from TypeScript, Kotlin, Swift, or any HTTP client.

The default binding is HTTP Fetch (POST JSON). Optional codecs wrap the same envelopes as HTTP bodies. Optional message transports carry the same envelopes as JSON text frames.

## Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they appear in all capitals, as shown here.

The frame-handling tables under [Message transports](#message-transports-optional) are normative as written: each row is the action a conforming peer takes. Sections marked **non-normative** are advice.

A **local failure** is one a client raises itself because no protocol result arrived: an abort, a lost connection, a timeout, or a frame it could not accept. It never crosses the wire, and how a client reports it is up to the client. Where this document quotes a local failure's message (`Request aborted`, `Connection closed`, `Network error`, `Invalid response`), that is the TypeScript reference client's wording; other clients may word it differently. The reference client's conventions are collected in the [TypeScript reference client](#appendix-typescript-reference-client) appendix.

## HTTP client checklist

Everything a JSON-over-HTTP client needs. Streams, files, and SSE are optional.

- `POST {prefix}/{procedure.path}` with `Content-Type: application/json` and body `{ "input": … }`; omit `input` (or send `null`) for no input. → [HTTP Fetch binding](#http-fetch-binding-default)
- Send `x-ts-pf-protocol: 1` on every request. → [HTTP Fetch binding](#http-fetch-binding-default)
- If the response carries `x-ts-pf-protocol` with any other value, do not decode the body; fail the call. → [Classifying an HTTP response](#classifying-an-http-response)
- Decode the body as an envelope: `"ok": true` → `output` (optional); `"ok": false` → `error`. → [Classifying an HTTP response](#classifying-an-http-response)
- A body that does not decode is a **transport failure**, never an application outcome: do not read "not found", "unauthenticated", or "forbidden" off the HTTP status. Retrying 5xx / 408 / 429 / network errors is optional, and only for calls that are safe to repeat (every call is a POST). → [Classifying an HTTP response](#classifying-an-http-response)
- On failure, switch on `error.code`, not the HTTP status. Handle unknown codes with a catch-all. → [Protocol errors](#protocol-errors)
- Do not retry `BAD_REQUEST` `Unsupported protocol version`: the server speaks another wire major. → [Versioning](#versioning)
- Optional streams: an `application/jsonl` response is one envelope per line and ends at EOF; a `text/event-stream` response ends at `event: close` (EOF without it is a failure); an `"ok": false` line or `event: error` ends the stream as a failure. → [Message streams](#message-streams-optional), [SSE](#sse-optional)
- Check your client against `conformance/http.json` (and `http-stream.json` if it reads streams). → [Conformance](#conformance)

## WebSocket client checklist

The same envelopes as multiplexed JSON text frames. The same list applies to stdio and `MessagePort`, minus the close codes.

- One compact JSON object per WebSocket **text** message; never binary. → [Framing](#framing)
- Send `{ "type": "hello", "v": 1 }` first (optionally with `meta`, e.g. `{ "authorization": "Bearer …" }`). Send no `call` until `hello-ok`. → [Handshake](#handshake), [Authenticating with `hello.meta`](#authenticating-with-hellometa-non-normative)
- Accept `hello-ok` only when `v` is the JSON number `1`; anything else fails the connect. On `hello-error`, fail the connect with its `error`. Close if neither arrives within your timeout. → [Handshake](#handshake)
- Do not retry a `hello-error` `Unsupported protocol version`. → [Reconnecting](#reconnecting-non-normative)
- Call ids are non-empty **strings**, unique among your in-flight calls. Do not reuse an id you cancelled (nothing confirms the server stopped). → [Frame types](#frame-types), [Cancel and mid-stream errors](#cancel-and-mid-stream-errors)
- You cannot tell a unary procedure from a stream before it answers: the first frame for an id decides. `result` → unary; `item` or `done` → the call resolves as a stream. → [First frame (client)](#first-frame-client)
- Terminal frames are `result` and `done`; at most one per id (none after you cancel). In a stream, `result` `"ok": false` is the failure and no `done` follows. → [Multiplex](#multiplex), [Output streams](#output-streams)
- Ignore frames for ids that are not in flight (for example `item` / `done` after a unary `result`), and frames of an unknown type for an in-flight id. → [Multiplex](#multiplex), [Legal sequences](#legal-sequences)
- On a local timeout, abort, or `break` out of a stream, send `{ "type": "cancel", "id" }`. No frame acknowledges it; ignore any frames that still arrive for that id. → [Cancel and mid-stream errors](#cancel-and-mid-stream-errors)
- A message that is not JSON, parses to a non-object, or is an invalid frame with no usable `id` closes the connection; a binary message closes it with `1002`. → [Multiplex](#multiplex), [Close codes](#close-codes-websocket)
- Streams do not survive a reconnect: resubscribe after the next `hello-ok`. → [Reconnecting](#reconnecting-non-normative)
- Check your client against `conformance/ws.json`. → [Conformance](#conformance)

## Envelope

Request value:

```json
{ "input": { "id": 1 } }
```

Procedures with no input may omit `input` or send `null`.

Success:

```json
{ "ok": true, "output": { "id": 1, "name": "Earth" } }
```

Failure:

```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "...", "data": { "id": 1 } } }
```

The procedure address is the nested router keys as `string[]` (HTTP joins them with `/`; message frames send the array).

## HTTP Fetch binding (default)

```
POST {prefix}/{procedure.path}
Content-Type: application/json
x-ts-pf-protocol: 1

{ "input": { "id": 1 } }
```

Procedure path is the nested router keys joined by `/`. Example: `planet.find` → `/rpc/planet/find` when the prefix is `/rpc`.

v1 accepts **POST only**. Other methods return HTTP 405 with `error.code: "METHOD_NOT_ALLOWED"`. A deployment may add a GET bridge in front of the handler (`GET {prefix}/{procedure.path}?input=<JSON>` rewritten to this POST); that is outside the v1 wire, and v1 clients and servers do not depend on it.

Servers read the request header `x-ts-pf-protocol`. Absent → accept (plain HTTP clients). Present and equal to `1` (after trimming surrounding whitespace) → accept. Any other value → the server MUST answer HTTP 400 with `error.code: "BAD_REQUEST"` and `message: "Unsupported protocol version"`; the response still carries `x-ts-pf-protocol: 1`. The check runs after the method check and before the body is read.

Clients SHOULD send `x-ts-pf-protocol: 1` on every request. A client reads the response as described in [Classifying an HTTP response](#classifying-an-http-response).

Success:

```
HTTP 200
Content-Type: application/json
x-ts-pf-protocol: 1

{ "ok": true, "output": { "id": 1, "name": "Earth" } }
```

Failure:

```
HTTP 4xx/5xx
Content-Type: application/json
x-ts-pf-protocol: 1

{ "ok": false, "error": { "code": "NOT_FOUND", "message": "...", "data": { "id": 1 } } }
```

## Classifying an HTTP response

A client decides what an HTTP response means from its headers and body, not from its status. Proxies, load balancers, gateways, and CDNs answer with statuses of their own (an HTML 404, a 502, a 413 from a body-size limit) that carry no ts-pf meaning.

1. **Version header.** A response whose `x-ts-pf-protocol` is present and, after trimming surrounding whitespace, is not `1` MUST NOT be decoded. It came from a server of another wire major; the client fails the call without reading the body.
2. **Envelope.** Otherwise the response is a ts-pf result only if its body decodes as an envelope: it parses as JSON to an object (not an array, not `null`), and either
   - `"ok"` is `true` — success; `output` is optional and an omitted `output` means no value; or
   - `"ok"` is `false` and `error` is present and is not `null` or a JSON primitive — failure.

   Clients SHOULD additionally require `error` to be an object (not an array) whose `code` is a non-empty string and whose `message` is a string, and MAY additionally require `Content-Type: application/json`. Other keys are ignored.
3. **Transport failure.** A response whose body does not decode is a **transport failure**. A client MUST NOT turn it into an application-level outcome (not found, unauthenticated, forbidden, validation failed, …) from the HTTP status alone. It MAY retry by status class: 5xx, 408, and 429 responses, and network errors that produced no response at all. Only retry a call the application knows is safe to repeat; ts-pf calls are POSTs and may write.
4. **Headerless responses.** A response without `x-ts-pf-protocol` whose body decodes is trusted as a result. A cross-origin browser client cannot read the header at all unless the server lists it in `Access-Control-Expose-Headers`, so the header's absence alone is not a transport failure.
5. **Streams.** A response with `Content-Type: application/jsonl` or `text/event-stream` to a client that accepts streams is classified by that content type, before any line is read: the call has succeeded with a stream (see [Message streams](#message-streams-optional) and [SSE](#sse-optional)). Each JSONL line, and the `data` of each SSE `message` / `error` event, is then decoded as an envelope as in step 2. Blank JSONL lines are ignored, and an SSE event with no `data` (other than `close`) carries nothing. A line that does not decode MUST end the stream with a failure; it MUST NOT be skipped or delivered as an item. A response with any other content type is classified by steps 2–4.

A decoded failure envelope is the server's answer whatever the HTTP status: switch on `error.code` ([Protocol errors](#protocol-errors)).

## Protocol errors

| Code | Status | When |
|---|---|---|
| `BAD_REQUEST` | 400 | Invalid JSON or envelope |
| `VALIDATION` | 422 | Input schema failed, or a stream item schema failed after the stream started. `error.data.issues` is `{ message, path }[]` |
| `NOT_FOUND` | 404 | Prefix matched, procedure missing |
| `METHOD_NOT_ALLOWED` | 405 | Non-POST |
| `PAYLOAD_TOO_LARGE` | 413 | Request body larger than the configured handler limit |
| `INTERNAL` | 500 | Unknown throw. A unary output schema failure is also 500 (server bug). Output schema checks are optional. |

The discriminator is `error.code`. HTTP status is unary transport only; it is not in the JSON body.

The table above is a **closed** set. Procedure-declared codes are application-defined strings with optional `data`. `VALIDATION` is the only protocol code with a specified `data` shape: `{ issues: { message, path }[] }` where `path` is `(string | number)[]`. Other protocol codes omit `data`. `INTERNAL` MUST NOT include a stack or output-schema issues. Servers MAY skip output schema checks. When a server checks a unary output schema and it fails, the code is `INTERNAL` and `data` is omitted. When a server checks a stream item and it fails, the code is `VALIDATION` with `issues`, in-band after the stream has started.

Unknown `code` values are valid JSON; clients MUST handle them (a catch-all branch). A procedure may reuse `NOT_FOUND` for a missing entity. Do not redeclare `VALIDATION`, `INTERNAL`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, or `PAYLOAD_TOO_LARGE`.

After a stream starts, HTTP status stays 200; the same `{ ok: false, error }` object appears as a JSONL line, SSE `event: error`, or a message-transport `{ "type": "result", "ok": false, "error": … }` frame. Switch on `code`, not HTTP status.

Contract-declared error codes use the status on the error definition when the HTTP binding sends a unary failure; a declared code with no `status` is sent as HTTP 400.

## Versioning

Header `x-ts-pf-protocol` and `v` on `hello` / `hello-ok` carry the **wire major**, currently `1`; the header is its decimal string. JSON is the default content type and the envelope above does not change for JSON calls. Other content types are codec-defined (see [Binary attachments](#binary-attachments-optional), [Message streams](#message-streams-optional), and [SSE](#sse-optional)). A codec may stream the HTTP body without changing this envelope. Optional [message transports](#message-transports-optional) carry the same major as `v: 1` on `hello` instead of this header.

**Revisions.** This document has a revision number (this is 1.2). Revisions are additive and keep the wire major: a peer cannot tell 1.0 from 1.1 or 1.2 on the wire. Additive means a 1.x sender emits a new key, frame type, header, or content type only when the user opted in, and a 1.0 receiver that does not understand it fails **that call** (`BAD_REQUEST`), never the connection and never silently. Receivers MUST NOT reject a value that 1.0 defined as valid. Bump the wire major only when the JSON envelope, a required frame field, or the handshake changes.

A client SHOULD NOT retry a call or connection that failed with `BAD_REQUEST` `Unsupported protocol version` (HTTP 400 or `hello-error`): the server speaks another wire major and answers the same way every time.

- **1.1** — servers read the request `x-ts-pf-protocol` (another value is `BAD_REQUEST` `Unsupported protocol version`), clients do not decode a response carrying another value, and the advisory content negotiation paragraph below.
- **1.2** — no new frame, key, header, or code. It adds [Classifying an HTTP response](#classifying-an-http-response), the RFC 2119 [conventions](#conventions), the [HTTP](#http-client-checklist) and [WebSocket](#websocket-client-checklist) client checklists, the [TypeScript reference client](#appendix-typescript-reference-client) appendix, the [conformance fixtures](#conformance), the WebSocket [close-code ranges](#close-codes-websocket), the non-normative [reconnecting](#reconnecting-non-normative) and [`hello.meta.authorization`](#authenticating-with-hellometa-non-normative) notes, `hello-error` carrying the application error a server raised while accepting `hello` ([Handshake](#handshake)), and `BAD_REQUEST` for a stream procedure called on an endpoint whose codec cannot carry streams ([Message streams](#message-streams-optional)).

**Content negotiation.** Clients MAY send `Accept` listing the response media types they can decode (`application/json`, `application/jsonl`, `text/event-stream`). Servers MAY use it to choose the framing of a streamed response and MUST ignore it when they cannot satisfy it (never 406; the JSON failure envelope is always `application/json`). `Content-Type` on the request selects the request codec as today.

## Binary attachments (optional)

JSON-only clients can ignore this section. The envelope keys stay `{ "input" }`, `{ "ok": true, "output" }`, and `{ "ok": false, "error" }`. Files are extra HTTP parts, not a different RPC.

| Condition | Content-Type | Body |
|---|---|---|
| No files in the value tree | `application/json` | Envelope above |
| One or more `File`/`Blob` values | `multipart/form-data` | Envelope in part `rpc` plus numbered file parts |
| Any failure | `application/json` | Failure envelope above |

A server that accepts multipart MUST still accept `application/json` so existing JSON clients keep working.

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

An endpoint whose body encoding cannot carry streams (JSON-only or multipart) MUST answer a call to a procedure whose input or output is a stream with HTTP 400, `error.code: "BAD_REQUEST"`, and `message: "Stream procedure requires a streaming codec"`, as a JSON failure envelope with `x-ts-pf-protocol: 1`. It MUST NOT answer such a call with a 200 non-stream body. A server that knows the procedure streams from its contract answers before reading the body or running the procedure; otherwise it answers when the procedure returns a stream, and closes that stream unread.

Output:

Streamed bodies (JSONL and SSE) SHOULD send `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`.

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

EOF is a successful close. There is no `done` field on the envelope. A line that does not decode as an envelope ends the stream as a failure ([Classifying an HTTP response](#classifying-an-http-response), step 5).

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

`data:` JSON is byte-identical to a JSONL line. Close is an explicit event so a truncated TCP close is not success: a client MUST treat EOF without `close` after the stream started as a failure. Comments may be sent immediately (to flush headers) and periodically (~15s) to defeat idle proxies. No `id:` or `retry:` in v1.

An RPC client reads the `fetch` response body. Native `EventSource` is not an RPC client (GET-only, no custom headers, auto-reconnects).

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
- HTTP status is Fetch-only. It is not a field on a frame, and a receiver MUST NOT reconstruct one from `error.code`.
- `METHOD_NOT_ALLOWED` is Fetch-only. There is no HTTP method on a frame.
- Procedure-declared `.errors()` `status` is Fetch-only. Every client, including TypeScript, switches on `error.code`.

`v: 1` on `hello` / `hello-ok` is the same wire major as header `x-ts-pf-protocol: 1`. Different carrier, same number.

### Framing

Logical frames are compact JSON objects. All three bindings send **JSON text**. Senders MUST NOT pretty-print (`JSON.stringify` of a compact object never emits a raw unescaped newline, so NDJSON is safe).

| Binding | Byte / message framing |
|---|---|
| WebSocket | One JSON string per WebSocket **text** message. Binary frames: close with no parse. Close code `1002`. |
| MessagePort | One JSON string per `postMessage`. Not structured clone of the object. Non-string data: close with no parse. |
| stdio | UTF-8 NDJSON. Split on `\n`. Strip an optional trailing `\r` and surrounding whitespace on **every** line (so `\r\n` works, matching HTTP JSONL). Empty lines ignored. Trailing partial line on EOF: if non-empty after that strip, treat it as a complete frame; if it fails decode, close. |

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

Each type travels one way:

| Direction | `type` |
|---|---|
| Client → server | `hello`, `call`, `cancel`, `in-item`, `in-done` |
| Server → client | `hello-ok`, `hello-error`, `result`, `item`, `done` |

A well-behaved peer never sends the wrong direction. After `ready`, treat a wrong-direction frame as an unknown type. Decode may still succeed if the shape is valid; the receiver then applies the [first-frame](#first-frame-client) / [multiplex](#multiplex) ignore rules. A wrong-direction frame with a usable `id` that is not a legal next event is ignored, or `Invalid response` if it is the first frame for that id. Do not invent a new error code.

| Field | Rule |
|---|---|
| `id` | Non-empty string. `"1"` is fine; `1` (number) is invalid; `""` is invalid. A client MAY use a decimal counter. A server MUST NOT treat it as a number (`Number(id)`). After a terminal frame, the same string may be reused for a new call. |
| `path` | Array of strings (may be empty). Not `"planet/find"`. A non-string element is invalid. |
| `v` | JSON number. Handshake uses the version check below. `"1"` is not a number. |
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
{ "type": "hello", "v": 1, "meta": { "authorization": "Bearer …" } }
{ "type": "hello-ok", "v": 1 }
{ "type": "hello-error", "error": { "code": "BAD_REQUEST", "message": "Unsupported protocol version" } }
{ "type": "hello-error", "error": { "code": "UNAUTHORIZED", "message": "Session expired" } }
```

**Server connection states:** `waiting-hello` → `ready` → `closed`.

**Order is locked:** valid hello → server accepts it (may await a per-connection context factory) → `hello-ok`. The server stays in `waiting-hello` until that accept settles. Do **not** buffer `call` frames during the wait. A well-behaved client does not send `call` until `hello-ok`. A `call` during `waiting-hello` is `Expected hello` then close.

`waiting-hello` inbound:

1. Inbound over-limit / binary / non-string / `JSON.parse` throw / parsed value is not a non-array object → **close with no frame**.
2. Else `JSON.parse` produced an object. Look at `type` and `v` **before** treating the object as a fully valid frame.
3. If `type` is `"hello"`, check `v`:

| `v` after `JSON.parse` | Action |
|---|---|
| Not a JSON number (missing, `"1"`, `true`, `null`, …) | `{ "type": "hello-error", "error": { "code": "BAD_REQUEST", "message": "Invalid hello" } }` then close. |
| JSON number and `v === 1` | Valid hello **if** the rest of the object is a legal `hello` (no extra keys). Then accept (row below). Extra keys / other field errors still `Invalid hello`. |
| JSON number and `v !== 1` (including `2`, `0`, `1.5`) | `{ "type": "hello-error", "error": { "code": "BAD_REQUEST", "message": "Unsupported protocol version" } }` then close. Numeric mismatch wins over extra keys. |

4. Branch on the rest:

| Condition | Action |
|---|---|
| Valid `hello` (`v === 1`, no extra keys), and this is the **first** hello | Stay `waiting-hello`. Accept the hello (context factory, if any). **Success:** send `{ "type": "hello-ok", "v": 1 }`, go `ready`, then and only then deliver **later** frames. **Failure:** send `hello-error` and close; do not send `hello-ok`. The `error` is mapped exactly as a procedure's thrown error is ([Cancel and mid-stream errors](#cancel-and-mid-stream-errors)): a deliberate application error (a TypeScript `PFError`) is sent as its `{ "code", "message", "data"? }`; any other throw sends exactly `{ "type": "hello-error", "error": { "code": "INTERNAL", "message": "Internal server error" } }` (no stack, no factory message). |
| Any other object (`type: "call"`, extra keys on `hello` with `v === 1`, missing `v`, frames that arrive **while accept is outstanding**, …) | `{ "type": "hello-error", "error": { "code": "BAD_REQUEST", "message": "Expected hello" } }` then close. If `type` is `"hello"` and this is not the numeric `v !== 1` case above, the message is `Invalid hello` instead. If accept is in flight, **abandon** it (ignore its later settle; do not send `hello-ok` if it succeeds after close). |

A server refuses a connection it will not serve by failing the accept with an application error, for example `{ "code": "UNAUTHORIZED", "message": "Session expired" }` for a missing or expired credential. The client receives that code instead of a bare close.

Optional hello timeout: if still `waiting-hello` when the timer fires (including during accept), close with no frame, abandon accept.

**Client connection states:** `connecting` → `handshaking` → `ready` → `closed`.

The client sends `hello` as soon as the duplex is open. `call` waits for `ready`.

If `JSON.parse` produced an object with `type: "hello-ok"`, check `v` the same way (numeric `v !== 1` is a version mismatch). The client does not send `hello-error`; it fails `ready` locally:

| `v` on `hello-ok` | Action |
|---|---|
| JSON number and `v === 1`, otherwise valid | Become `ready`. |
| Not a JSON number | Fail the connect as a local `Invalid response`. Close. |
| JSON number and `v !== 1` (including `2`, `0`, `1.5`) | Fail the connect as a local `Invalid response`. Close. |

| Received while `handshaking` | Action |
|---|---|
| Valid `hello-ok` (`v === 1`) | Become `ready`. |
| Valid `hello-error` | Fail the connect with that `error` (`BAD_REQUEST`, `INTERNAL`, or an application code such as `UNAUTHORIZED`), not as a local failure. Close. |
| Anything else parsed (wrong type, extra keys, invalid `v` as above) | Fail the connect as a local `Invalid response`. Close. |
| Unparseable / close / timeout | Fail the connect as a local failure (`Network error` or `Connection closed`). |

On a client hello timeout, fail the connect locally, then close. A client that disables its timeout relies on the caller aborting or closing the connection.

#### Authenticating with `hello.meta` (non-normative)

`meta` is free-form and untrusted. For a credential, the recommended convention is `meta.authorization` carrying the same value an HTTP client puts in the `Authorization` header (`"Bearer <token>"`), so a server can use one parser for its HTTP and socket endpoints. Browsers cannot set headers on a WebSocket upgrade, so `meta` is the portable carrier; send it over `wss:` only. The server checks it while accepting the hello and refuses with a `hello-error` carrying an application code (for example `UNAUTHORIZED`).

The credential is fixed for the life of the connection. Rotating it without reconnecting is deferred to a later revision; to present a new credential, reconnect.

### Multiplex

**At most one terminal frame per id.** Terminal frames are:

- `{ "type": "result", … }` (unary success, unary / application / protocol error, or mid-stream error)
- `{ "type": "done", "id" }` (successful output-stream EOF)

After a terminal frame, the id is free for reuse. Until then:

| Event | Action |
|---|---|
| Duplicate `call` for an in-flight id | **Ignore.** Do not emit `result` on that id. Do not replace the running call. Do not close the connection (other ids must survive a buggy peer). Well-behaved clients never reuse an in-flight id. |
| Unknown / invalid frame whose `id` is in-flight | **Ignore.** Do not settle that call. Do not send a second `result`. |
| Unknown / invalid frame whose `id` is a non-empty string **not** in-flight | Server: send `{ "type": "result", "id", "ok": false, "error": { "code": "BAD_REQUEST", "message": "…" } }`. That *is* the terminal frame for a call that never started. Client: ignore it (there is no call to settle). |
| Unknown / invalid frame with no usable id, **after `ready`** | Close. No `hello-error` (handshake is over). |
| `JSON.parse` throw, non-object, non-string WS/port payload, binary WS frame, inbound over-limit | **Always close.** No id extraction, no regex, no partial parse. **Exception in `waiting-hello` only:** if `JSON.parse` succeeded as an object, send `hello-error` `BAD_REQUEST` then close (even when the object is not a valid frame). |

A client ignores every frame whose `id` is not one of its in-flight calls, valid or not: a late frame after a terminal frame or after `cancel`, or a frame for an id it never used.

A hostile peer cannot cancel an in-flight call by reusing its id or sending `{ "type": "nope", "id" }`. They can still send `{ "type": "cancel", "id" }` — that is the documented cancel path.

The connection keeps reading frames while a call runs. Two in-flight ids complete independently.

#### Backpressure

No frame acknowledges `item` or `in-item`, and no frame carries a window; flow control in wire major 1 is the transport's. A sender SHOULD NOT pull the next value from the producing iterator until the transport has drained the previous frame of that id (`bufferedAmount` under a high-water mark, `write()` accepted or `drain` fired). A receiver MAY stop reading the transport while a per-id queue is over a local high-water mark; pausing is connection-wide, so one slow consumer delays every id on that connection. On a transport the receiver cannot pause (`MessagePort`, a browser `WebSocket`) receiver memory is bounded only by the peer's behaviour; a receiver MAY `cancel` a stream it cannot keep up with.

A sender MAY give up on a peer that does not drain within a timeout. That is a server-side condition, not a protocol code: the server sends `{ "type": "result", "id", "ok": false, "error": { "code": "INTERNAL", "message": "Peer did not drain within <n> ms" } }` as the terminal frame for that id (after the items already handed to the transport; no `done`), stops the procedure as if cancelled, and keeps the connection open. A client that gives up on a server that does not drain its `in-item` frames fails the call locally and sends `cancel`. A 1.x receiver already ignores an unknown frame type with an in-flight `id` (table above), so a future credit frame is harmless to it; one for an id that has already terminated would draw `BAD_REQUEST`, so a later major must never send credit after a terminal frame.

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
| `hello` / `hello-ok` / `hello-error` / `cancel` / `call` / `in-item` / `in-done` | No substitute frame. A client `call` that cannot be sent fails that call with `PAYLOAD_TOO_LARGE` (oversize) or `INTERNAL` (stringify). A hello that cannot be sent fails the connect locally, then close. |

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

Sequence: `C: call` then `S: result ok:true | result ok:false`. Optional: `C: cancel` after `call` and before the terminal. After cancel, the server stops; no further frames for this id. No frame acknowledges `cancel`: the client treats the call as finished when it sends `cancel` and ignores any frames that still arrive for that id. Because nothing confirms the server has let go of the id, a client SHOULD NOT reuse a cancelled id (a server still holding it ignores the new `call` as a duplicate).

HTTP distinguishes unary vs stream via `Content-Type`. Message frames have no content type. The client uses the **first inbound frame for that id**.

#### First frame (client)

After sending `call` (and while possibly sending `in-item` / `in-done` if `call.stream === true`), wait for the first inbound frame with this `id`:

| First frame | Client action |
|---|---|
| `result` `ok: true` | Resolve to `output` (possibly `undefined`). Unary done. |
| `result` `ok: false` | Reject with that `error`. |
| `item` | Resolve the call as a stream whose first item is this `output` (an async iterable in TypeScript); then continue in `streaming-out`. |
| `done` | Resolve the call as an empty stream that is already complete (JSONL uses EOF, multiplex cannot). |
| `cancel` / `call` / `hello*` / `in-item` / `in-done` | Reject this call as local `Invalid response`. Do not close the connection. Ignore further frames for this id. |
| Peer close before any frame | Reject as local `Connection closed`. |

The call's result is not itself the stream: for output streams it **resolves to** a stream the caller then reads (in TypeScript, `const tokens = await client.planet.chat(...)` then `for await`, the same as JSONL).

#### `streaming-out` (after the call resolved to a stream)

Further frames drive the **stream**, not the call's result.

| Event | Action |
|---|---|
| `item` | Yield `output` (omitted → `undefined`). |
| `done` | Complete the iterator. |
| `result` `ok: false` | **Reject the iterator** with that `error`. This is the legal mid-stream error, **not** the “in-flight → ignore” rule. No `done`. |
| `result` `ok: true` / unknown type / extra `done` / `item` after `done` | Illegal. **Ignore** (do not close the connection; do not reject a second time). Well-behaved servers never send these. |
| Peer close / client close | Reject the iterator as local `Connection closed` if not already done. |
| Caller stops reading early (TypeScript: `break`, iterator `return()` / `throw()`) | Send `{ "type": "cancel", "id" }` (not `in-done`, not `done`). Stop reading frames for this id. The server sees `cancel` and stops emitting. |

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

**Illegal** (peer must not send; receiver: if the id is in-flight **and this is not a legal `streaming-out` `result ok: false`**, **ignore**; if this is the first frame, `Invalid response` / `BAD_REQUEST` as in the first-frame table; once the id has terminated, the frame is for an id not in flight and the client ignores it):

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

The server MUST accept `in-item` for that id as soon as `call` is accepted (an item sent right after the `call` must not be lost). Backpressure is the transport's; see "Backpressure" under Multiplex. No credit-based flow control in v1. Cancel of the call aborts both sides.

### Cancel and mid-stream errors

**No frames for this id after cancel or after a terminal frame.** A late procedure completion must not send.

| Catch | Action |
|---|---|
| Declared / protocol `error` from the procedure or from a stream `next()` | Send `{ "type": "result", "id", "ok": false, "error": { "code", "message", "data?" } }`. Declared codes survive. Status is **not** on the wire. Do not send `done`. If already cancelled, send nothing. |
| Unknown throw | `{ "type": "result", "id", "ok": false, "error": { "code": "INTERNAL", "message": "Internal server error" } }`. If cancelled, still invoke any local error hook, send nothing. |
| Abort after client `cancel` (generator checks `signal` and throws `AbortError`) | Send **nothing**. Prefer silence. Do not encode `INTERNAL`. |
| Client abort while **in flight** (a `call` was sent) | Send `{ "type": "cancel", "id" }`. Reject locally (`Request aborted`). Ignore late `result` / `item` / `done`. |
| Client abort **before hello-ok** (no id yet) | Reject locally (`Request aborted`). Do **not** send `cancel`. Do **not** close the connection unless hello itself failed (timeout / `hello-error` / peer close). Other `call`s may still wait for the same `ready`. |
| Output-stream cancel (iterator `return()` / `throw()` / `AbortSignal`) | Client sends `{ "type": "cancel", "id" }` (not `in-done`). Server aborts, stops emitting, ends any input queue. |
| Input generator throw / early `return()` | Client sends `{ "type": "cancel", "id" }` (not `in-done`). Same server cancel path. |

A client keeps three outcomes apart: a **local failure** (no protocol result arrived; see [Conventions](#conventions)), a **failure envelope** from the server (switch on `error.code`; declared and protocol codes alike), and protocol `INTERNAL` from the server (a server-side failure, not a local one). Message transports carry no HTTP status; a client that exposes a status field leaves it empty on this pipe.

### Close codes (WebSocket)

The protocol uses two standard close codes: `1000` (normal closure — an explicit close, the close after a `hello-error`, a hello timeout, a malformed or oversize text message) and `1002` (protocol error — a binary or other non-string message). The close code is advisory: the reason for a failure travels in frames (`hello-error`, `result`).

- **4900–4999 are reserved for this protocol** (for example, a future code for a version mismatch that must not be retried, or for a hello timeout). Applications MUST NOT send them.
- **4400–4499 are RECOMMENDED for applications**, mirroring HTTP status: `4401` unauthenticated, `4403` forbidden, `4429` rate limited, and so on. Use them to end a live connection for an application reason after `hello-ok` (a revoked session, a ban), with a short reason string. Before `hello-ok`, refuse with a `hello-error` carrying an application code instead.

### Reconnecting (non-normative)

There is no session resumption: a new connection starts with `hello`, and no id, call, or stream carries over.

- **Streams do not survive a reconnect.** A dropped connection ends every in-flight call and stream with a local failure. Resubscribe (call the stream procedure again) after the new `hello-ok`.
- **Stream delivery is at most once.** Items sent while the connection was down are lost, and nothing replays them. An application that needs gap-free state re-syncs after resubscribing: for example, the stream's first item says "subscribed", the client then fetches the current state with a unary call, and applies later items on top of that snapshot (discarding items older than it, by a version or timestamp the application puts in them).
- **Never retry `Unsupported protocol version`** (a `hello-error`, or HTTP `BAD_REQUEST` with that message): the server speaks another wire major and answers the same way every time. Surface it.
- **Back off between attempts**, exponentially and with jitter (for example a random delay between 0 and `min(cap, base × 2^attempt)`), and reset the attempt count once a connection has reached `hello-ok` and stayed up. Without jitter, a server restart draws every client back at the same instant.
- Credentials are fixed at `hello` ([Authenticating with `hello.meta`](#authenticating-with-hellometa-non-normative)); a new credential means a new connection.

## Conformance

Language-neutral test vectors for this document live in [`conformance/`](https://github.com/crobinson42/ts-pf/tree/main/packages/protocol/conformance) next to it, and ship in the `@ts-pf/protocol` npm package: `http.json` (unary JSON requests and response classification), `http-stream.json` (`application/jsonl` output streams), and `ws.json` (WebSocket frame scripts, which also cover stdio and `MessagePort` minus binary messages and close codes). They are plain JSON data, not schemas. A client in any language replays them against its own code, with no server and no network; the directory's `README.md` defines the format, how a runner replays each file, and how to report results.

Each file carries `"protocol": 1` and the `"revision"` of this document it was written against, and each case cites the sections it checks. Where a case and this document disagree, this document wins. The TypeScript reference client (`FetchLink`, `FetchLink` with `StreamCodec`, `WsLink`) replays every file in this repository's CI.

## Appendix: TypeScript reference client

Non-normative. These are the conventions of the TypeScript packages (`@ts-pf/client`, `@ts-pf/client-http`, `@ts-pf/message-client`, and the servers they talk to). They are not protocol fields, they are **not** on the wire, and other clients need not copy them. `PFError`, `instanceof`, and `asResult` are JavaScript conveniences; any HTTP client parses the envelope.

### Constants

`PROTOCOL_MAJOR` (`1`) in `@ts-pf/protocol` is the wire major; `PROTOCOL_VERSION` (`'1'`) is its decimal string, the `x-ts-pf-protocol` value. A declared code's HTTP status comes from `httpStatus()` in `@ts-pf/http` (protocol codes → the table above, else the declared `status ?? 400`).

### Local failures

The TypeScript client maps a local failure to a `PFError` with `code: 'INTERNAL'`, `local: true`, and `status: 0`. `isLocalFailure(error)` is `local === true` (never `status === 0`). Network throws keep `error.message` and set `Error.cause` to the thrown value (Node's `ECONNREFUSED` is then `error.cause.cause`). `toJSON()` omits `status`, `cause`, and `local`, so a server can never make a client think a failure was local.

| Event | TypeScript `PFError` | `isLocalFailure` |
|---|---|---|
| `AbortSignal` while a call is in flight | `INTERNAL`, `local: true`, status `0`, message `Request aborted`, `cause` set; message transports send `cancel` | true |
| `AbortSignal` while waiting on `ready` (no id) | `INTERNAL`, `local: true`, status `0`, message `Request aborted`, `cause` set; no `cancel`; connection stays up | true |
| HTTP network error (no response) | `INTERNAL`, `local: true`, status `0`, the thrown error's message (or `Network error`), `cause` set | true |
| Peer disconnect mid-call | `INTERNAL`, `local: true`, status `0`, message `Connection closed`; `cause` only when the transport reported an error | true |
| Hello timeout / connect fail / hello stringify fail | `INTERNAL`, `local: true`, status `0`, message `Network error` (a `WsLink` socket `error` event before open: `Network error` with the event as `cause`; a close before open: `Connection closed`); close | true |
| Malformed frame from peer with no usable id (connection closes) | Inflight: `INTERNAL`, `local: true`, status `0`, message `Connection closed` (`Invalid response` / `Network error` during the handshake) | true |
| First frame for an id is illegal | `INTERNAL`, `local: true`, status `0`, message `Invalid response`; that call only | true |
| `hello-ok` with another `v` | `INTERNAL`, `local: true`, status `0`, message `Invalid response`; close | true |
| Protocol `result` `{ "ok": false, "error" }` | code / message / data from the envelope; `status` is `undefined` | false |
| `hello-error` (version mismatch, `INTERNAL`, or an application code from the server's context factory) | code / message / data from the envelope (or `local: true` if the connection closed first) | false |
| Client refused to send oversize / could not stringify a `call` | `PAYLOAD_TOO_LARGE` or `INTERNAL` (stringify) | false |

### Status on a rejected error

`PFError.status` is `number | undefined`: transport metadata, never identity, with no default. Switch on `error.code`; treat `status` as a hint and guard it (`err.status ?? 400`).

| Transport | `status` on the rejected `PFError` |
|---|---|
| HTTP unary failure (`FetchLink`) | The HTTP response status (declared `NOT_FOUND { status: 404 }` → `404`; declared code without `status` → `400`; protocol codes → the table above). A codec decode failure rethrown under `x-ts-pf-protocol: 1` keeps the codec's `400` |
| HTTP after a stream started (JSONL line / SSE `event: error`) | `undefined` (the response was already 200); a line that does not decode throws the codec's `BAD_REQUEST` with `400` |
| WebSocket / stdio / MessagePort | `undefined` (no HTTP status on a frame; `errorFromEnvelope` does not synthesize one) |
| Local failure (`localFailure`, `isLocalFailure`) | `0` with `local: true` |
| In-process `createLocalClient` | The declared `ErrorDef.status` when there is one, else `undefined` |

### HTTP (`FetchLink`)

`FetchLink` sends `x-ts-pf-protocol: 1` on every request and classifies responses as follows. None of these is a local failure, because each response came from a server; `RetryPlugin` therefore does not retry them by default.

| Response | Rejected `PFError` |
|---|---|
| `x-ts-pf-protocol` present and not `1` | `INTERNAL`, the HTTP status, message `Unsupported protocol version (x-ts-pf-protocol: <value>)`, `cause` = the `Response`; body unread |
| No `x-ts-pf-protocol`, body does not decode | `INTERNAL`, the HTTP status, message `Non-RPC response (HTTP <status>)`, `cause` = the decode error. A proxy's HTML 404 never surfaces as `NOT_FOUND` or as the codec's `BAD_REQUEST` |
| `x-ts-pf-protocol: 1`, body does not decode | The codec's own `PFError` (`BAD_REQUEST` `Invalid JSON`, `Response body must be a JSON object`, `Invalid RPC envelope`, or `Unsupported content type` from the stream codecs), else `INTERNAL` `Invalid response` with the HTTP status |
| Decoded failure envelope | code / message / data from the envelope, `status` = the HTTP status |

`JSONCodec` does not look at the response `Content-Type`; `StreamCodec` and `SseCodec` accept `application/json` (or no content type), `application/jsonl`, and (SSE) `text/event-stream`, and reject others as `Unsupported content type`. A stream response resolves the call at once; a JSONL line or SSE event that does not decode makes the iterator throw the codec's `BAD_REQUEST`, an SSE `error` event whose `data` is a success envelope throws `INTERNAL` `Invalid error event`, and EOF without `event: close` throws `INTERNAL` `Stream truncated`. Unknown SSE event names and comments are skipped. JSONL EOF is success.

Retries are a `CallPlugin`: `createClient` retries nothing by default, and `RetryPlugin`'s default predicate is `isLocalFailure` (network errors and lost connections; never an abort), so it never retries a 5xx, 408, or 429 response unless you pass `retry`. Cross-origin browser clients read `x-ts-pf-protocol` only when the server exposes it (`CORSPlugin` `exposeHeaders: ['x-ts-pf-protocol']`).

### Message transports

`MessageSession` defaults its hello timeout to `10_000` ms on both client and server (`helloTimeoutMs`; `0` disables it). On the server, the per-connection context factory (`bind(..., { context })`) is the hello accept: a thrown `PFError` becomes the `hello-error` (through `toWireError`, the same mapping as a handler's error), and any other throw becomes `INTERNAL` / `Internal server error`. `HandlerOptions.onError` sees the non-`PFError` throws only, as it does for handlers. `WsHandler.bind(...)` returns a handle whose `close(code?, reason?)` closes the socket with that code (default `1000`) before the session tears down; `PortHandler`, `StdioHandler`, and `DuplexHandler` handles take `close()` (those pipes have no close codes). The TypeScript packages send only `1000` and `1002` themselves. The client side does not surface the close code: calls fail with a local `Connection closed`, so an app that wants the code passes its own `socket` to `WsLink` and listens for `close` on it. `WsLink` / `PortLink` / `StdioLink` / `DuplexLink` take the hello `meta` as the `meta` option.

### Server side (`FetchHandler`)

`FetchHandler` sets `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no` when the codec body is a `ReadableStream`, and `x-ts-pf-protocol: 1` on every response it builds.
