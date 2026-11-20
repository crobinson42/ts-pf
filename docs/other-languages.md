# Clients in other languages

How to call a ts-pf server from a client that is not TypeScript: a mobile app (Dart, Swift, Kotlin), a desktop app, or a service in Python, Go, or anything else. Nothing here assumes you read TypeScript. Code is pseudocode; translate it into your language's HTTP and JSON libraries.

ts-pf does not ship runtimes for other languages. It ships the things that let you write a small one and know it is right:

| ts-pf gives you | You write |
| --- | --- |
| The wire spec, [`PROTOCOL.md`](../packages/protocol/PROTOCOL.md), with one-screen [HTTP](../packages/protocol/PROTOCOL.md#http-client-checklist) and [WebSocket](../packages/protocol/PROTOCOL.md#websocket-client-checklist) client checklists | A thin transport: about 100–200 lines for HTTP, more if you use the WebSocket protocol |
| Conformance fixtures: plain JSON test cases your tests replay against your transport, with no server | A small test runner for those fixtures |
| An OpenAPI 3.1 document shaped for code generators, so your platform's generator produces the models | One place that maps protocol errors to your app's failure types |
| A catalog hash and a breaking-change check, so drift between server and client is caught in CI | A CI step that compares the hash |

`PROTOCOL.md` is normative; this page explains it and puts it in order. Where the two seem to disagree, `PROTOCOL.md` wins.

## 1. Get typed models

A ts-pf API is RPC over HTTP: every call is a `POST` to a path built from the procedure name, with the input in a JSON envelope. The server team describes it as OpenAPI with the codegen profile of [`@ts-pf/openapi`](../packages/openapi/README.md#codegen-profile), and serves or commits the file. This is the server's code, the only TypeScript on this page:

```ts
import { catalogHash } from '@ts-pf/codegen'
import { catalog } from '@ts-pf/docs'
import { openapi } from '@ts-pf/openapi'
import { contract } from './contract.js'

const cat = catalog(contract, { prefix: '/rpc' })

export const mobileSpec = openapi(cat, {
  info: { title: 'Planet API', version: '1.0.0' },
  profile: 'codegen',
  // Streams served only over the WebSocket: describe their types without paths.
  streams: 'components',
  // Lets a client tell which catalog it was generated from (section 7).
  catalogHash: catalogHash(cat),
})
```

The profile gives generators what they need:
- PascalCase component names, with nested objects hoisted into named components.
- One shared `RpcError` envelope, an `ErrorCode` enum, and a `<Code>Data` schema for every error code that carries data.
- `x-ts-pf-errors` on each operation, listing the codes it can return.
- `discriminator` mappings on tagged unions.
- With `streams: 'components'`, an `x-ts-pf-streams` map giving each stream procedure's input (or streamed `inputItem`), its `item` (or unary `output`), and its `errors` codes.

Use `streams: 'components'` when streams run over a message transport such as a WebSocket. The default (`'operation'`) describes them as HTTP JSONL operations.

Run your platform's OpenAPI generator (openapi-generator, Kiota, swift-openapi-generator, swagger_parser, …) in **models-only** mode, and write the transport yourself (section 2). The client classes generators produce assume REST. They pick the outcome from the HTTP status, which is wrong for ts-pf (section 3), and the call layer ts-pf needs is small.

Configure the generator so the models survive the server evolving ([Evolving a contract](evolution.md)):
- **Outputs are open.** Ignore unknown keys in responses; never fail to parse because the server added a field.
- **Enums and unions are open.** Keep an unknown enum value or union variant as an "unknown" case. Do not throw.
- **`ErrorCode` is open.** A newer server can return a code your build has never seen. Some protocol codes are not listed at all, such as the `NOT_FOUND` a removed procedure returns.
- **Error data is mapped by code.** Nothing in the document `$ref`s a `<Code>Data` schema. Pick the model from `error.code`: `NOT_FOUND` → `NotFoundData`, and the protocol's `VALIDATION` → `ValidationErrorData`.
- **Absent and `null` are different.** A missing `output` or `data` means no value, while `"output": null` is a null value. Keep the two apart if your language's optionals make that easy to blur.

## 2. Call a procedure over HTTP

The procedure's path is its router keys joined by `/`, under the server's prefix: `planet.find` with prefix `/rpc` is `POST /rpc/planet/find`. ([HTTP Fetch binding](../packages/protocol/PROTOCOL.md#http-fetch-binding-default).)

```text
call(path: list of strings, input: optional JSON, options) -> Result

  url     = baseUrl + prefix + "/" + join(path, "/")
  headers = {
    "content-type":     "application/json",
    "x-ts-pf-protocol": "1",
    "authorization":    "Bearer " + tokens.current(),   // if your app uses bearer auth
  }
  body = input is absent ? {} : { "input": input }      // {} or {"input": null} both mean "no input";
                                                        // the codegen document shows {"input": null}

  response = http.post(url, headers, json(body),
                       timeout = options.timeout, cancel = options.cancelToken)
  if no response (network error, timeout, cancelled):
      return LocalFailure(reason)                       // the call never got an answer
  return classify(response)                             // section 3
```

Give every call its own timeout and a way to cancel it. Send `x-ts-pf-protocol: 1` on every request: it is a SHOULD, and it lets a server of another wire major refuse you clearly.

## 3. Classify the response

This is the step that matters most. A response is a ts-pf result only if its body is a ts-pf envelope. Proxies, load balancers, gateways, captive portals, and CDNs answer with statuses of their own (an HTML 404, a 401 from an auth gateway, a 502, a 413), and those carry no meaning about your API. ([Classifying an HTTP response](../packages/protocol/PROTOCOL.md#classifying-an-http-response).)

```text
classify(response) -> Result

  // 1. Another wire major: do not read the body.
  v = response.header("x-ts-pf-protocol")
  if v is present and trim(v) != "1":
      return VersionMismatch                          // never retry; surface "update the app"

  // 2. A stream, if you asked for one: decided by media type, before reading any line.
  if you accept streams and mediaType(response.header("content-type")) is "application/jsonl"
     (or "text/event-stream", if you read SSE):
      return Stream(response)                         // read it as in section 5

  // 3. Decode the envelope.
  body = try parseJson(utf8(response.body))
  if body is an object:
      if body.ok is the JSON boolean true:
          return Success(body.output)                 // "output" absent = no value
      if body.ok is the JSON boolean false and body.error is an object
         and body.error.code is a non-empty string    // object, non-empty code, string message:
         and body.error.message is a string:          // the spec's SHOULD (its MUST rejects only a
                                                      // missing, null, or primitive error)
          return RemoteError(body.error.code, body.error.message, body.error.data)

  // 4. Anything else is not an answer from your API.
  return TransportFailure(status = response.status)
```

A response without the `x-ts-pf-protocol` header whose body decodes is still a result. Only a header with another value stops the decode.

```text
Result =
    Success(output?)
  | Stream(response)                    // only when you asked for a stream; read it as in section 5
  | RemoteError(code, message, data?)   // the server answered: switch on code (section 4)
  | TransportFailure(status?)           // a body that is not an envelope; the status is a hint only
  | VersionMismatch                     // the server speaks another wire major
  | LocalFailure(reason)                // no response: network, timeout, cancelled
```

> **Never act on the HTTP status of a body that is not an envelope.** A `TransportFailure` must not sign the user out, delete local data, show "not found", or mark queued work as permanently failed, whatever the status. An app that maps "404 → no access → forget this record" loses user data the first time a proxy serves an HTML error page. Only a decoded `RemoteError` with a specific `code` may drive those decisions.

Retrying is optional and up to you: a `TransportFailure` with status 5xx, 408, or 429, and a `LocalFailure` from a network error, are candidates. Every ts-pf call is a `POST` and may write, so only retry a call your app knows is safe to repeat.

A decoded `RemoteError` is the server's answer whatever the HTTP status. Do not read anything into its status either.

## 4. Handle errors

Switch on `code`, always with a catch-all branch. ([Protocol errors](../packages/protocol/PROTOCOL.md#protocol-errors).)

```text
toAppFailure(result) -> AppFailure

  match result:
    RemoteError(code = "VALIDATION", data)       -> InvalidInput(data.issues)    // [{ message, path }]; mid-stream
                                                                                 // it means an item failed (server-side)
    RemoteError(code = "NOT_FOUND")              -> NotFound
    RemoteError(code = "PAYLOAD_TOO_LARGE")      -> TooLarge
    RemoteError(code = "BAD_REQUEST", message = "Unsupported protocol version")
                                                 -> ClientOutdated               // never retry
    RemoteError(code = "UNAUTHORIZED")           -> SignedOut                    // your server's own codes
    RemoteError(code = "RATE_LIMITED", data)     -> RetryLater(data.retryAfterSeconds)
    RemoteError(code, message)                   -> ServerError(code, message)   // catch-all: unknown codes
    TransportFailure(status)                     -> Unreachable(retryable = status in 5xx, 408, 429
                                                                and the call is safe to repeat)
    VersionMismatch                              -> ClientOutdated
    LocalFailure(reason)                         -> Offline(reason)
```

- **Two kinds of code.** The protocol's own codes are a closed set: `BAD_REQUEST`, `VALIDATION`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`, `INTERNAL`. Your server declares the rest. `x-ts-pf-errors` on an operation lists that procedure's declared codes plus the protocol codes it can return. The OpenAPI `ErrorCode` enum is the union of these lists. Neither lists the protocol `NOT_FOUND` a removed procedure returns (unless a procedure also declares `NOT_FOUND`), which is one more reason to keep a catch-all.
- **Map once.** Do it in one place at the edge of your network layer, so the rest of the app never sees protocol shapes.
- **Keep local and remote apart.** "The server said no" (`RemoteError`) and "no answer arrived" (`LocalFailure`, `TransportFailure`) lead to different decisions. Do not merge them.
- **Retry policy is yours.** The protocol says only that a client SHOULD NOT retry `Unsupported protocol version`.

## 5. Streams

Most apps need only unary calls. If you need a stream (live updates, progress, tokens), pick the simplest binding the server offers:

| Binding | Good for | Cost |
| --- | --- | --- |
| **JSONL over HTTP** ([Message streams](../packages/protocol/PROTOCOL.md#message-streams-optional)) | Server-to-client streams, one per request (also streamed input, sent as a JSONL request body) | A streaming HTTP read; nothing else |
| **SSE** ([SSE](../packages/protocol/PROTOCOL.md#sse-optional)) | The same, where your platform has a good SSE client | Output only |
| **WebSocket message protocol** ([Message transports](../packages/protocol/PROTOCOL.md#message-transports-optional)) | Many subscriptions on one connection, input streams, or an app that already keeps a socket open | A handshake, call ids, cancel, reconnect: a few hundred lines |

### JSONL over HTTP

Same request as section 2, through the same `classify`. The version check comes first. A response whose media type is `application/jsonl` has then succeeded with a stream; compare the media type only, ignoring parameters such as `charset`. Decide by content type, not by status. Any other content type is classified as an ordinary response, so a failure before the stream starts is still a JSON envelope.

```text
readStream(response) -> sequence of items, or a failure

  for each line in response.body (UTF-8; split on "\n", trim surrounding whitespace):
      if line is empty: continue
      env = try parseJson(line)
      if env is an object and env.ok is the JSON boolean true:  yield env.output  // absent = no value
      else if env is a failure envelope:             fail RemoteError(...)  // in-band error; nothing follows
      else:                                          fail TransportFailure  // never skip a bad line
  clean end of body: complete successfully
  read error or connection reset: fail with LocalFailure
```

To stop early, cancel the HTTP request.

**SSE** frames the same envelopes as `event: message` / `event: error` with a `data:` line. Three rules matter:
- `event: close` is the only successful end. EOF without it is a failure, a MUST.
- `event: error` ends the stream with that failure.
- Skip comments and unknown events.

See [SSE](../packages/protocol/PROTOCOL.md#sse-optional).

### WebSocket message protocol

One connection carries many calls. Every message is one compact JSON object sent as a WebSocket **text** message. Start with the [WebSocket client checklist](../packages/protocol/PROTOCOL.md#websocket-client-checklist).

```text
connect():
  socket = open(wsUrl)                                       // wss: when you send a credential
  send { "type": "hello", "v": 1 }                           // add "meta": { "authorization": "Bearer …" }
                                                             // only if your app authenticates this way
  wait for the first message (with a timeout):
    { "type": "hello-ok", "v": 1 }  (v is the JSON number 1) -> ready
    { "type": "hello-error", "error": e }                    -> fail connect, and every call waiting for
                                                                ready, with RemoteError(e); close (1000)
    anything else, or no answer in time                      -> fail connect locally; close
  calls made before ready wait for it; send no "call" frame before ready

call(path, input):                                // path is a list: ["planet", "find"]
  wait for ready
  id = nextId()                                   // a non-empty STRING: "1", "2", ...
  send { "type": "call", "id": id, "path": path, "input": input }    // omit "input" when there is none
  the first frame for id decides the shape:
    result ok:true (output?)                      -> unary success; forget id
    result ok:false (error)                       -> RemoteError; forget id
    item (output?)                                -> a stream; this is its first item
    done                                          -> an empty stream, already complete; forget id
    cancel / call / hello* / in-item / in-done    -> fail this call locally ("invalid response");
                                                     keep the connection; ignore later frames for id
    an unknown type, or a frame that fails decode -> ignore; keep waiting
  later frames for a stream:
    item                                          -> next item
    done                                          -> complete; forget id
    result ok:false                               -> fail the stream with RemoteError; no done follows; forget id
    result ok:true, unknown type, extra done      -> ignore

callWithInputStream(path, values):                // only if the procedure's input is a stream
  wait for ready and assign id as in call(); then:
  send { "type": "call", "id": id, "path": path, "stream": true }    // no "input" key at all
  for each value: send { "type": "in-item", "id": id, "input": value }
  then send { "type": "in-done", "id": id }       // if producing values fails: send cancel instead
  stop sending once a terminal frame (result / done) arrives for id
  replies follow call()'s first-frame rules

cancel(call):                                     // timeout, user abort, unsubscribe
  if the call has no id yet (waiting for ready): fail it locally; send nothing; keep the connection; stop
  send { "type": "cancel", "id": call.id }
  forget call.id: ignore anything that still arrives for it, and do not reuse it

onMessage(message):
  binary message                                  -> close with code 1002
  not JSON, or not a JSON object                  -> close (1000)
  check the frame against PROTOCOL.md "Frame types" (allowed keys, required keys, field types);
  an invalid frame is treated like an unknown type:
  after ready, a frame with no usable string id   -> close (1000)
  any frame for an id that is not in flight       -> ignore
  an unknown or invalid frame for an in-flight id -> ignore (do not settle the call)

onClose(), whoever closed:
  fail every in-flight call and open stream locally ("connection closed")
  if the handshake had not finished: fail the connect and every call waiting for ready
  locally (unless a hello-error already failed them)
```

Details that are easy to get wrong ([Frame types](../packages/protocol/PROTOCOL.md#frame-types), [First frame](../packages/protocol/PROTOCOL.md#first-frame-client)):
- **Exact types.** Ids are strings (`1`, a number, is invalid), and `v` is the JSON number `1`, not `"1"`. Check JSON types strictly: in some languages `true == 1`, but `{"ok": 1}` is not a success and `"v": true` is not version 1. Send compact JSON (no spaces or newlines), and never `NaN` or `Infinity`, which are not JSON.
- **Omit what has no value.** Leave out `input` and `meta` when you have none. The fixtures compare frames exactly, and an absent key is not the same as `null`.
- **The server does not label calls.** Your transport must resolve a first `item` or `done` as a stream, even for a procedure you expect to be unary; the fixtures check this. A typed layer above the transport may then reject a stream where it expected a value, as a local "invalid response". If it does, it sends `cancel` for that id so the server stops, and never reuses the id.
- **Nothing acknowledges `cancel`.**

**Reconnecting.** ([Reconnecting](../packages/protocol/PROTOCOL.md#reconnecting-non-normative).)
- **Nothing survives a disconnect.** Every in-flight call fails locally. After the next `hello-ok`, call your stream procedures again.
- **Items are delivered at most once.** If you need gap-free state, re-sync after resubscribing:
  1. Subscribe.
  2. Wait until the stream says it is live, for example a first "subscribed" item your server sends.
  3. Fetch the current state with a unary call.
  4. Apply later items on top of it, discarding items older than the snapshot (by a version or timestamp your app puts in them).
- **Back off with jitter.** Wait a random delay between 0 and `min(cap, base × 2^attempt)`, and reset the attempt count once a connection has reached `hello-ok` and stayed up.
- **Never reconnect after a version mismatch:** a `hello-error` `Unsupported protocol version`, or a `hello-ok` whose `v` is a number other than `1`. Show "update the app" instead.
- **The credential is fixed at `hello`.** A new token means a new connection.

**Close codes.** ([Close codes](../packages/protocol/PROTOCOL.md#close-codes-websocket).)
- The protocol uses `1000` and `1002`, and reserves `4900`–`4999`. Applications MUST NOT send codes in that range.
- For application reasons, `4400`–`4499` are recommended, mirroring HTTP statuses. A server uses them to end a live connection after `hello-ok`, for example `4401`: sign in again. Before `hello-ok`, a server refuses with a `hello-error` carrying an application code instead.
- The reason for a failure travels in frames. The close code is a hint.

## 6. Prove it with the conformance fixtures

The fixtures are plain JSON test cases. Each case says what your client must send and how it must classify what comes back, including malformed responses on purpose. Your tests replay them against your transport through a fake HTTP engine or a fake socket: no server, no network. ([Conformance fixtures README](../packages/protocol/conformance/README.md).)

| File | Covers | Who runs it |
| --- | --- | --- |
| `http.json` | Unary calls and response classification | Every HTTP client |
| `http-stream.json` | JSONL streams | Clients that read HTTP streams |
| `ws.json` | WebSocket frame scripts: handshake, calls, streams, cancel, bad frames | Clients of the WebSocket protocol |

Pin the version you test against. The files ship in the `@ts-pf/protocol` npm package, so any npm CDN serves them without npm installed:

```text
https://cdn.jsdelivr.net/npm/@ts-pf/protocol@<version>/conformance/http.json
https://unpkg.com/@ts-pf/protocol@<version>/conformance/http.json
```

Commit the files you test against (with a note of the version), or download them in CI from a pinned URL. Never track `latest`.

```text
for each case in http.json and http-stream.json:
    engine = FakeHttpEngine(answer = case.response)        // status, headers, exact body text
    client = Client(prefix = "", http = engine)             // expected paths are "/planet/find"
    result = client.call(case.request.procedure, case.request.input)
    assert engine.lastRequest matches case.expectRequest   // method, path, headers (case-insensitive
                                                           // names), JSON body equal to body or bodyOneOf
    assert result matches case.expect                      // success / error / transport-failure /
                                                           // version-mismatch / stream (items, then end)

for each case in ws.json:
    socket = FakeSocket()
    session = connect(socket, meta = case.options.meta, helloTimeout = off, reconnect = off)
    for each step in case.steps:
        before receive*, serverClose, and expect steps: let the client run until idle
        send          -> the next message the client sent must equal step.send
                         (bind the call id your client chose to the script's "1", "2", …)
        receive       -> deliver step.receive as one text message
        receiveText   -> deliver this exact string as a text message
        receiveBinary -> deliver these bytes as a binary message
        serverClose   -> close the socket from the server side
        call          -> start call "a" with path and input (or inputStream)
        abort         -> abort call "a" (or stop reading its stream)
        expect        -> assert what the caller observed
    at the end: let the client run until idle
    fail the case if the client sent any message no send step matched
```

The README is the full definition: every field, how to bind ids, JSON equality (an absent key is not `null`), and which differences count only as warnings. Report the file's `revision` and each case id with your results.

## 7. Stay in sync with the server

- **Know which catalog you were built from.** With the `catalogHash` option, the OpenAPI document carries `info.x-ts-pf-catalog-hash`. In CI, compare the hash in your committed copy with the server's current one. A difference means: fetch the new document and regenerate.
- **The server team catches breaking changes.** They commit `catalog.json` and run `ts-pf-codegen diff` on every change; it exits `2` on a change that breaks old clients ([Breaking-change check](../packages/codegen/README.md#breaking-change-check)). The OpenAPI document is generated output; the diff runs on the catalog.
- **Expect the server to move first.** Old app builds stay installed for months. Follow [Evolving a contract](evolution.md): unknown codes, enum values, union variants, and output fields are normal.
- **Version the requests you store.** Offline queues and outboxes replay calls later, possibly against a newer server and from a newer app build. Store a schema version with each queued request and migrate or drop old ones on upgrade. `NOT_FOUND` can mean the procedure was removed (the protocol's `NOT_FOUND`, with no `data`) or, if the procedure declares it, that an entity is missing. Do not discard queued user data on a `NOT_FOUND` your build cannot attribute to a declared entity error. Surface it as "this build may be outdated".

## Checklist

- [ ] Models generated from the codegen-profile OpenAPI, with open outputs, enums, unions, and error codes.
- [ ] Requests: `POST`, `content-type: application/json`, `x-ts-pf-protocol: 1`, `{ "input": … }`, a per-call timeout and cancel.
- [ ] Responses classified by envelope, never by HTTP status; a non-envelope body never changes auth or local data.
- [ ] Errors mapped once, on `code`, with a catch-all; local failures kept apart from server answers.
- [ ] Streams (if any) over the simplest binding; WebSocket clients follow the [checklist](../packages/protocol/PROTOCOL.md#websocket-client-checklist) and never reconnect after a version mismatch.
- [ ] Conformance fixtures replayed in CI from a pinned version.
- [ ] Catalog hash compared in CI; stored requests versioned.

The [HTTP client checklist](../packages/protocol/PROTOCOL.md#http-client-checklist) and [WebSocket client checklist](../packages/protocol/PROTOCOL.md#websocket-client-checklist) in `PROTOCOL.md` are the complete, normative lists.
