---
name: ts-pf-http
description: Use when writing or configuring a ts-pf HTTP codec — JSONCodec, RpcCodec, PROTOCOL_HEADER, joinProcedurePath, httpStatus. Triggers: @ts-pf/http, JSONCodec, RpcCodec, PROTOCOL_HTTP_STATUS.
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
httpStatus(error) // Response.status from PFError
// header name: PROTOCOL_HEADER ('x-ts-pf-protocol')
```

`JSONCodec` is the default body. Encode returns `{ contentType, body }`. Decode takes `{ contentType, text(), formData(), body() }`.

## API

- `JSONCodec`, `RpcCodec`, `RpcEncodedBody`, `RpcBodySource`
- `PROTOCOL_HEADER`, `joinProcedurePath`, `parseProcedurePath`
- `httpStatus`, `PROTOCOL_HTTP_STATUS`

## Pair with

- Handler/link: `ts-pf-server-http` / `ts-pf-client-http` (they take `{ codec }`)
- Other bodies: `ts-pf-file` / `ts-pf-stream` / `ts-pf-sse`

## Don't

- `FetchHandler` or `FetchLink` here.
- Put these exports on `@ts-pf/protocol`.
- Use this as a WebSocket / stdio framer — that is `ts-pf-message`.
