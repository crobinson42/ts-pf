---
name: ts-pf-sse
description: Use when framing ts-pf stream output as text/event-stream with SseCodec. Triggers: @ts-pf/sse, SseCodec, SSE_CONTENT_TYPE.
---

# @ts-pf/sse

Opt-in `SseCodec`: root `AsyncIterable` **output** as `text/event-stream`. JSON calls stay JSON. Input streams stay JSONL.

Install: `npm i @ts-pf/sse@beta`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { stream } from '@ts-pf/stream'
import { SseCodec } from '@ts-pf/sse'
import { FetchHandler } from '@ts-pf/server-http'
import { FetchLink } from '@ts-pf/client-http'

const codec = new SseCodec() // optional { inner, keepAliveMs } — default 15_000; 0 disables pings
new FetchHandler(app, { codec })
new FetchLink({ url: '/rpc', codec })

procedure.output(stream(z.object({ token: z.string() })))
```

Contracts still use `stream()` from `@ts-pf/stream`. This package does not re-export it.

## API

- `SseCodec`
- `SSE_CONTENT_TYPE`

## Pair with

- `ts-pf-stream` (`stream()`)
- `ts-pf-server-http` / `ts-pf-client-http`

## Don't

- EventSource clients, Last-Event-ID, EventPublisher.
- Fold SSE into `@ts-pf/server-http`.
- Import `stream()` from this package.
