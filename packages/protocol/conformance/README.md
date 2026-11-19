# ts-pf protocol conformance fixtures

Language-neutral test vectors for [`PROTOCOL.md`](../PROTOCOL.md). A client in any language proves it follows the protocol by replaying these files against its own code: no server, no network, no dependency on the TypeScript packages. The TypeScript reference client (`FetchLink`, `FetchLink` with `StreamCodec`, `WsLink`) replays the same files in this repository's CI.

| File                                   | Binding                                      | What a case is                                                                 |
| -------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| [`http.json`](http.json)               | Unary JSON over HTTP                         | One request the client must send and one response it must classify             |
| [`http-stream.json`](http-stream.json) | `application/jsonl` output streams over HTTP | The same, where the response may be a stream                                   |
| [`ws.json`](ws.json)                   | Message frames over WebSocket                | A script of frames the client sends and receives, and what its caller observes |

The files are data, not schemas: plain JSON, readable without a validator. They ship in the `@ts-pf/protocol` npm package (`conformance/`), and TypeScript can import them typed from `@ts-pf/protocol/conformance`.

## Versioning

Every file starts with:

```json
{ "protocol": 1, "revision": "1.2", "binding": "http", "description": "…", "cases": [ … ] }
```

- `protocol` is the wire major (`x-ts-pf-protocol: 1`, `v: 1` on `hello`).
- `revision` is the `PROTOCOL.md` revision the cases were written against. It changes with the spec: a new revision may add cases, and a case changes only when the spec it cites changes. Pin the package version (or a commit) you test against, and report the `revision` with your results.
- Case `id`s are unique across all files and stable across revisions, so results can be compared over time.

Each case has a `description` that ends with the `PROTOCOL.md` sections it checks (`PROTOCOL.md: Classifying an HTTP response, step 3.`). When a case and the spec disagree, the spec wins; please report it.

## Shared rules

- **JSON equality.** "Equal" means the same JSON value: object key order does not matter, numbers compare by value, and a key that is absent is not the same as a key whose value is `null`.
- **Absent means no value.** `output` (and an item's `output`, and `data`) is omitted when there is none. A client that represents "no value" (`undefined`, `nil`, `None`, `Unit`, …) must produce it for an omitted `output`, and a JSON `null` for `"output": null`.
- **Errors.** An `error` (or the `code` / `message` / `data` of an `"kind": "error"` expectation) is the failure envelope's `{ code, message, data? }`. The client must surface the same `code`, `message`, and `data` to its caller. A `data` that is absent must surface as no data.
- **Local failures.** `local-failure` means a failure the client raised itself because no protocol result arrived (see `PROTOCOL.md` "Conventions"); the caller must be able to tell it apart from a failure envelope. How it is reported is up to the client. `reference` is the TypeScript reference client's message for it, informative only.

## HTTP: `http.json` and `http-stream.json`

Each case:

```json
{
  "id": "http-success-output",
  "description": "…",
  "request": { "procedure": ["planet", "find"], "input": { "id": 1 } },
  "expectRequest": {
    "method": "POST",
    "path": "/planet/find",
    "headers": { "content-type": "application/json", "x-ts-pf-protocol": "1" },
    "body": { "input": { "id": 1 } }
  },
  "response": {
    "status": 200,
    "headers": { "content-type": "application/json", "x-ts-pf-protocol": "1" },
    "body": "{\"ok\":true,\"output\":{\"id\":1,\"name\":\"Earth\"}}"
  },
  "expect": { "kind": "success", "output": { "id": 1, "name": "Earth" } }
}
```

To replay a case:

1. Configure the client with an empty URL prefix (or any prefix `P`; then the expected path is `P` + `path`) and an HTTP transport you control: an injected HTTP function, a mock engine, or an interceptor that never reaches the network.
2. Call `request.procedure` with `request.input`. An absent `input` means a call with no input.
3. Check the request the client sent against `expectRequest`:
   - `method` and `path` are equal.
   - Every header in `headers` is present with that value. Names are case-insensitive. `content-type` compares by media type (parameters such as `charset` are ignored). Other headers are allowed.
   - The body parses as JSON and equals `body`, or equals one of `bodyOneOf` (a call with no input may send `{}` or `{"input":null}`).
4. Answer with `response`: that `status`, those `headers`, and `body` as the exact response text (it may not be JSON on purpose).
5. Check what the caller observes against `expect`.

`expect.kind`:

| `kind`              | The call must                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `success`           | Succeed with `output` (absent: no value).                                                                                                                                                                                                                                                                                                                                                                                                         |
| `error`             | Fail with the failure envelope `code`, `message`, and `data` (absent: no data). Never derive the outcome from the HTTP status.                                                                                                                                                                                                                                                                                                                    |
| `transport-failure` | Fail with a transport failure: the body did not decode as an envelope. It must not be reported as success or as an application outcome such as "not found", "unauthenticated", or "forbidden", whatever the HTTP status (`PROTOCOL.md` "Classifying an HTTP response", step 3). A client may additionally retry by status class; a runner gives each case one response, so a retrying client should have retries off or report the final outcome. |
| `version-mismatch`  | Fail because `x-ts-pf-protocol` names another wire major, without decoding the body. The fixture body is a valid 1.x envelope on purpose: a client that decodes it gets the wrong answer.                                                                                                                                                                                                                                                         |
| `stream`            | (`http-stream.json` only) Succeed with a stream. Reading it yields exactly `items` in order (each `{ "output": … }`, or `{}` for an item with no value), then ends as `end` says.                                                                                                                                                                                                                                                                 |

`end.kind` for a stream:

| `end.kind`          | Reading the stream must                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `eof`               | Complete successfully after the last item.                                                         |
| `error`             | Fail with the in-band failure line's `code`, `message`, and `data`.                                |
| `transport-failure` | Fail because a line did not decode. Lines after it are not delivered: a bad line is never skipped. |

A client that does not implement streams skips `http-stream.json`; its cases with `kind` `success` / `error` behave as in `http.json`.

## WebSocket: `ws.json`

Each case is a script that runs over one connection, from the client's side. A runner plays the server: it hands the client a socket (or a test double of one) that it controls, records every message the client sends, and delivers server messages when the script says so.

```json
{
  "id": "ws-unary-result",
  "description": "…",
  "steps": [
    { "send": { "type": "hello", "v": 1 } },
    { "receive": { "type": "hello-ok", "v": 1 } },
    { "call": "a", "path": ["planet", "find"], "input": { "id": 1 } },
    {
      "send": {
        "type": "call",
        "id": "1",
        "path": ["planet", "find"],
        "input": { "id": 1 }
      }
    },
    {
      "receive": {
        "type": "result",
        "id": "1",
        "ok": true,
        "output": { "id": 1, "name": "Earth" }
      }
    },
    {
      "expect": {
        "call": "a",
        "outcome": "value",
        "output": { "id": 1, "name": "Earth" }
      }
    }
  ]
}
```

Open the connection before the first step, configured with `options` when the case has them (`options.meta` is the connect metadata the client sends as `hello.meta`). Disable the client's own hello timeout and reconnects for the run. Then run the steps in order. Each step has one of these keys:

| Step            | Meaning                                                                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `send`          | The next message the client sends must be one text message whose JSON equals this frame. Wait for it (a short timeout is a failure).                                                    |
| `receive`       | Deliver this frame to the client as one compact JSON text message. Some are invalid on purpose.                                                                                         |
| `receiveText`   | Deliver this exact string as a text message (it need not be JSON).                                                                                                                      |
| `receiveBinary` | Deliver these bytes (base64) as a binary message.                                                                                                                                       |
| `call`          | The caller starts a call labelled by the value (`"a"`) with `path` and `input` (absent: no input), or with `inputStream`: a streamed input that yields those values and then completes. |
| `abort`         | The caller gives up on call `"a"`: abort it if it is still pending, or stop reading it if it resolved to a stream.                                                                      |
| `expect`        | An outcome the caller observes, below.                                                                                                                                                  |

Before each `receive*` and `expect` step, and after the last step, let the client run until it is idle. A message the client sent that no `send` step matched fails the case: a client sends exactly the scripted frames, in order, and nothing else (no `call` before `hello-ok`, nothing after `cancel`, no reply to an ignored frame).

**Call ids.** Fixture ids are `"1"`, `"2"`, … in call order. A client may number its calls differently: when a `send` step's `call` frame carries an id the script has not seen, bind it to the id the client actually sent (a non-empty string, different from every id bound before) and substitute the bound id in every later `send` and `receive` frame. Ids the client never sent (`"99"`) are delivered as written.

`expect` values:

| Expectation                                                   | The caller must observe                                                                                                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ "call": "a", "outcome": "value", "output"? }`              | Call `a` resolved to `output` (absent: no value).                                                                                                                    |
| `{ "call": "a", "outcome": "error", "error" }`                | Call `a` failed with that failure envelope error.                                                                                                                    |
| `{ "call": "a", "outcome": "stream" }`                        | Call `a` resolved to a stream (the first frame for its id was `item` or `done`).                                                                                     |
| `{ "call": "a", "outcome": "local-failure", "reference"? }`   | Call `a` failed with a local failure.                                                                                                                                |
| `{ "stream": "a", "outcome": "item", "output"? }`             | The next value read from call `a`'s stream is `output` (absent: no value).                                                                                           |
| `{ "stream": "a", "outcome": "done" }`                        | Call `a`'s stream completed successfully.                                                                                                                            |
| `{ "stream": "a", "outcome": "error", "error" }`              | Reading call `a`'s stream failed with that error.                                                                                                                    |
| `{ "stream": "a", "outcome": "local-failure", "reference"? }` | Reading call `a`'s stream failed with a local failure.                                                                                                               |
| `{ "handshake": "error", "error" }`                           | The connect failed with that `hello-error` error (not a local failure). A runner whose client exposes no connect result observes it on a call made after this point. |
| `{ "handshake": "local-failure", "reference"? }`              | The connect failed with a local failure.                                                                                                                             |
| `{ "closed": { "code"? } }`                                   | The client closed the connection, with that WebSocket close code when `code` is present.                                                                             |

The scripts cover one connection, so they cannot observe reconnects; in real use, a client should not reconnect after a `hello-error` `Unsupported protocol version` at all (`PROTOCOL.md` "Reconnecting").

**Other message pipes.** stdio and `MessagePort` carry the same frames: skip the cases that use `receiveBinary`, and ignore `code` in `closed`.

## Reporting results

Report, per file, the `revision` you tested and each case `id` as passed, failed (with what the client did instead), or skipped (with the reason, for example "no stream support"). A client conforms to a binding at a revision when every case in that file passes or is skipped for an optional feature it does not implement (`http-stream.json` for a JSON-only client).
