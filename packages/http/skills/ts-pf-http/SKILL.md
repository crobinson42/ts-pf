---
name: ts-pf-http
description: "Use when writing or configuring a ts-pf HTTP codec — JSONCodec, RpcCodec, EnvelopeTextCodec, PROTOCOL_HEADER, joinProcedurePath, httpStatus. Triggers: @ts-pf/http, JSONCodec, RpcCodec, EnvelopeTextCodec, PROTOCOL_HTTP_STATUS."
---

# @ts-pf/http

HTTP wire helpers. No `FetchHandler`, no `FetchLink`.

Install: `npm i @ts-pf/http`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { JSONCodec, PROTOCOL_HEADER, httpStatus, joinProcedurePath } from '@ts-pf/http'

const codec = new JSONCodec()
joinProcedurePath('/rpc', ['planet', 'find']) // '/rpc/planet/find'
httpStatus(error) // Response.status from PFError: protocol table, else error.status ?? 400
// header name: PROTOCOL_HEADER ('x-ts-pf-protocol')
```

`JSONCodec` is the default body. Encode returns `{ contentType, body }`. Decode takes `{ contentType, text(), formData(), body() }`. `decodeRequest` throws `BAD_REQUEST` for invalid JSON, a non-object body, or an envelope object with keys but no `input` key (`{"id":1}` instead of `{"input":{"id":1}}`); `{}` and `{"input":null}` decode to `input: undefined`. Wrapping codecs (`MultipartCodec`, `StreamCodec`, `SseCodec`) inherit these checks.

Those wrappers take `inner?: EnvelopeTextCodec` — an `RpcCodec` whose encoded bodies are strings (`RpcEncodedText`), because they embed one envelope per part / line / event. `JSONCodec` implements it; `FetchHandler` / `FetchLink` still take any `RpcCodec`. Building your own wrapper: `mimeType(contentType)` (media type, lower-cased, no parameters), `isJsonContentType(contentType)` (`application/json` or no header), `jsonBodySource(text)` (an `RpcBodySource` over one in-memory envelope).

## API

- `JSONCodec`, `RpcCodec`, `RpcEncodedBody`, `RpcBodySource`
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
