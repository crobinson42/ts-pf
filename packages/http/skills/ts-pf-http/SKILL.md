---
name: ts-pf-http
description: "Use when writing or configuring a ts-pf HTTP codec — JsonCodec, RpcCodec, EnvelopeTextCodec, PROTOCOL_HEADER, joinProcedurePath, httpStatus. Triggers: @ts-pf/http, JsonCodec, RpcCodec, EnvelopeTextCodec, PROTOCOL_HTTP_STATUS."
---

# @ts-pf/http

HTTP wire helpers. No `FetchHandler`, no `FetchLink`.

Install: `npm i @ts-pf/http`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { JsonCodec, PROTOCOL_HEADER, httpStatus, joinProcedurePath } from '@ts-pf/http'

const codec = new JsonCodec()
joinProcedurePath('/rpc', ['planet', 'find']) // '/rpc/planet/find'
httpStatus(error) // Response.status from PFError: protocol table, else error.status ?? 400
// header name: PROTOCOL_HEADER ('x-ts-pf-protocol')
```

`JsonCodec` is the default body. Encode returns `{ contentType, body }`. Decode takes `{ contentType, text(), formData(), body() }`. `decodeRequest` throws `BAD_REQUEST` for invalid JSON, a non-object body, or an envelope object with keys but no `input` key (`{"id":1}` instead of `{"input":{"id":1}}`); `{}` and `{"input":null}` decode to `input: undefined`. Wrapping codecs (`MultipartCodec`, `StreamCodec`, `SseCodec`) inherit these checks.

A custom `RpcCodec` sets `streams`: `true` when it encodes an `AsyncIterable` output as a `ReadableStream` body and decodes an `AsyncIterable` input, `false` when it cannot (`JsonCodec` / `MultipartCodec` are `false`, `StreamCodec` / `SseCodec` `true`). On `streams: false`, `FetchHandler` answers a stream procedure with `BAD_REQUEST` before the body is read.

Those wrappers take `inner?: EnvelopeTextCodec` — an `RpcCodec` whose encoded bodies are strings (`RpcEncodedText`), because they embed one envelope per part / line / event. `JsonCodec` implements it; `FetchHandler` / `FetchLink` still take any `RpcCodec`. Building your own wrapper: `mimeType(contentType)` (media type, lower-cased, no parameters), `isJsonContentType(contentType)` (`application/json` or no header), `jsonBodySource(text)` (an `RpcBodySource` over one in-memory envelope).

## API

- `JsonCodec`, `RpcCodec` (`streams?: boolean`), `RpcEncodedBody`, `RpcBodySource`
- `EnvelopeTextCodec`, `RpcEncodedText`
- `mimeType`, `isJsonContentType`, `jsonBodySource`
- `PROTOCOL_HEADER`, `joinProcedurePath`, `parseProcedurePath`
- `httpStatus`, `PROTOCOL_HTTP_STATUS`

## Pair with

- Handler/link: `ts-pf-server-http` / `ts-pf-client-http` (they take `{ codec }`)
- Other bodies: `ts-pf-file` / `ts-pf-stream` / `ts-pf-sse`

## Don't

- `FetchHandler` or `FetchLink` here.
- Put these exports on `@ts-pf/protocol`.
- Use this as a WebSocket / stdio framer — that is `ts-pf-message`.
- Pass a `Blob` / stream-bodied codec as a wrapper's `inner` — it must be an `EnvelopeTextCodec`.
- Leave `streams` unset on a custom codec — set `true` if it carries streams, `false` if it cannot (stream procedures then fail with 400 before the handler runs).
