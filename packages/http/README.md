# @ts-pf/http

HTTP wire helpers for [ts-pf](https://github.com/crobinson42/ts-pf#readme): `JSONCodec`, the `RpcCodec` interface, `PROTOCOL_HEADER`, `joinProcedurePath` / `parseProcedurePath`, `httpStatus`, and the content-type / body-source helpers the wrapping codecs share. `FetchHandler` (`@ts-pf/server-http`) and `FetchLink` (`@ts-pf/client-http`) are built on these; use them directly for a raw `fetch` call, a custom codec, or your own adapter. Does **not** include `FetchHandler` or `FetchLink`.

## Install

```sh
npm i @ts-pf/contract @ts-pf/server @ts-pf/server-http @ts-pf/client @ts-pf/client-http zod
```

`@ts-pf/http` comes with `@ts-pf/server-http` / `@ts-pf/client-http`; install it directly when you import from it.

## Use

```ts
import { httpStatus, JSONCodec, joinProcedurePath, PROTOCOL_HEADER } from '@ts-pf/http'
import { PFError, PROTOCOL_VERSION } from '@ts-pf/protocol'

// Call a ts-pf endpoint with plain fetch — what curl or a non-TS client sends.
const url = joinProcedurePath('/rpc', ['planet', 'find']) // '/rpc/planet/find'
const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', [PROTOCOL_HEADER]: PROTOCOL_VERSION },
  body: JSON.stringify({ input: { id: 1 } }),
})
// res.headers.get(PROTOCOL_HEADER) === PROTOCOL_VERSION on every RPC response
const envelope = await res.json()
// { ok: true, output } | { ok: false, error: { code, message, data? } }

// What FetchHandler does with a thrown PFError: body from the codec, status
// from the table (VALIDATION 422, NOT_FOUND 404, INTERNAL 500, …).
const codec = new JSONCodec() // the default RpcCodec; FetchHandler / FetchLink take { codec }
httpStatus(new PFError({ code: 'NOT_FOUND', status: 404 })) // 404
```

A custom body encoding implements `RpcCodec` (`encode` returns `{ contentType, body }`; `decode` takes `{ contentType, text(), formData(), body() }`) and goes on `FetchHandler` / `FetchLink` via `{ codec }`. First-party codecs: `@ts-pf/file`, `@ts-pf/stream`, `@ts-pf/sse`. The message-transport analog is `@ts-pf/message`.

### Wrapping codecs

`MultipartCodec`, `StreamCodec`, and `SseCodec` embed one JSON envelope per multipart `rpc` part, JSONL line, or SSE event, so their `inner` codec must produce text. That role is `EnvelopeTextCodec`: an `RpcCodec` whose encoded bodies are `RpcEncodedText` (`body: string`). `JSONCodec` implements it; handlers and links still accept any `RpcCodec`. The helpers they share are exported for your own wrapper:

```ts
import { type EnvelopeTextCodec, isJsonContentType, JSONCodec, jsonBodySource, mimeType } from '@ts-pf/http'

mimeType('application/json; charset=utf-8') // 'application/json' (lower-cased, no parameters; '' when missing)
isJsonContentType(null) // true — a missing Content-Type is treated as JSON, like JSONCodec does
const inner: EnvelopeTextCodec = new JSONCodec()
const line = (await inner.encodeSuccess({ id: 1 })).body // a string, by type
await inner.decodeResponse(jsonBodySource(line)) // { ok: true, output: { id: 1 } }
```

`jsonBodySource(text)` is an `RpcBodySource` over one in-memory envelope (`contentType: 'application/json'`, empty `formData()`, `body()` null).

Wire spec: [`PROTOCOL.md`](https://github.com/crobinson42/ts-pf/blob/main/packages/protocol/PROTOCOL.md). Happy path: [root README](https://github.com/crobinson42/ts-pf#readme).

## API

- `JSONCodec`, `RpcCodec`, `RpcEncodedBody`, `RpcBodySource`
- `EnvelopeTextCodec`, `RpcEncodedText` (the `inner` role of `MultipartCodec` / `StreamCodec` / `SseCodec`)
- `mimeType`, `isJsonContentType`, `jsonBodySource`
- `PROTOCOL_HEADER`, `joinProcedurePath`, `parseProcedurePath`
- `httpStatus`, `PROTOCOL_HTTP_STATUS`

## Agent skills

This package ships [`ts-pf-http`](https://github.com/crobinson42/ts-pf/blob/main/packages/http/skills/ts-pf-http/SKILL.md). Sync with `npx skills experimental_sync -y`.
