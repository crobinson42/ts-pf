# @ts-pf/stream

Opt-in `StreamCodec` for root `AsyncIterable` input and output. JSON calls stay JSON. Streams are `application/jsonl` — one existing RPC envelope per line.

Agent skill: [`skills/ts-pf-stream/`](skills/ts-pf-stream/). Sync with `npx skills experimental_sync -y`.

```ts
import { procedure } from '@ts-pf/contract'
import { z } from 'zod'
import { stream, StreamCodec } from '@ts-pf/stream'

import { FetchHandler } from '@ts-pf/server-http'
import { FetchLink } from '@ts-pf/client-http'

const codec = new StreamCodec()
new FetchHandler(app, { codec })
new FetchLink({ url: '/rpc', codec })

procedure.output(stream(z.object({ token: z.string() })))
```

Use the same codec on the handler and the link. A `stream()` procedure on the default `JSONCodec` (or `MultipartCodec`) answers `400 BAD_REQUEST` `Stream procedure requires a streaming codec` before the handler runs.

Put cleanup on the handler's `signal`, not in a generator's `finally`: a cancel calls the stream's `return()`, and an async generator that was never pulled completes on `return()` without running its body, so its `finally` never runs.

Wire spec: [`packages/protocol/PROTOCOL.md`](../protocol/PROTOCOL.md) (Message streams). SSE output framing of the same envelopes is [`@ts-pf/sse`](../sse) (`SseCodec`); `stream()` is not re-exported there.
