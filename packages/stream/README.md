# @ts-pf/stream

Opt-in `StreamCodec` for root `AsyncIterable` input and output. JSON calls stay JSON. Streams are `application/jsonl` — one existing RPC envelope per line.

Agent skill: [`skills/ts-pf-stream/`](skills/ts-pf-stream/). Sync with `npx skills experimental_sync -y`.

```ts
import { stream, StreamCodec } from '@ts-pf/stream'

import { FetchHandler } from '@ts-pf/server-http'
import { FetchLink } from '@ts-pf/client-http'

const codec = new StreamCodec()
new FetchHandler(app, { codec })
new FetchLink({ url: '/rpc', codec })

procedure.output(stream(z.object({ token: z.string() })))
```

Wire spec: [`packages/protocol/PROTOCOL.md`](../protocol/PROTOCOL.md) (Message streams). SSE output framing of the same envelopes is [`@ts-pf/sse`](../sse) (`SseCodec`); `stream()` is not re-exported there.
