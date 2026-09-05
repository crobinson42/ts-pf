# @ts-pf/sse

Opt-in `SseCodec` that frames root `AsyncIterable` **output** as `text/event-stream`. JSON calls stay JSON. Input streams stay `application/jsonl`. Contracts still use `stream()` from `@ts-pf/stream` — this package does not re-export it.

Agent skill: [`skills/ts-pf-sse/`](skills/ts-pf-sse/). Sync with `npx skills experimental_sync -y`.

Public exports: `SseCodec`, `SSE_CONTENT_TYPE`.

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

Wire spec: [`packages/protocol/PROTOCOL.md`](../protocol/PROTOCOL.md) (SSE).
