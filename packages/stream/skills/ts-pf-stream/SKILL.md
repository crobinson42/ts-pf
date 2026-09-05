---
name: ts-pf-stream
description: Use when streaming root AsyncIterable over ts-pf with stream() and StreamCodec (JSONL). Triggers: @ts-pf/stream, StreamCodec, stream(), application/jsonl.
---

# @ts-pf/stream

Opt-in `StreamCodec` for root `AsyncIterable` input and output. JSON calls stay JSON. Streams are `application/jsonl`.

Install: `npm i @ts-pf/stream`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { stream, StreamCodec } from '@ts-pf/stream'
import { FetchHandler } from '@ts-pf/server-http'
import { FetchLink } from '@ts-pf/client-http'

const codec = new StreamCodec()
new FetchHandler(app, { codec })
new FetchLink({ url: '/rpc', codec })

procedure.output(stream(z.object({ token: z.string() })))
```

Root only. Same codec on handler and link.

## API

- `StreamCodec`
- `stream()`

## Pair with

- `ts-pf-server-http` / `ts-pf-client-http`
- SSE output framing: `ts-pf-sse` (`SseCodec`; this package still owns `stream()`)

## Don't

- Nested streams or File/Blob in items (`BAD_REQUEST`).
- Import `stream()` from `@ts-pf/sse` — it is not re-exported there.
