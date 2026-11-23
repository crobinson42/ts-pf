# @ts-pf/stream

Opt-in codecs for root `AsyncIterable` input and output. JSON calls stay JSON. `StreamCodec` frames streams as `application/jsonl` (one existing RPC envelope per line); `SseCodec` frames stream **output** as `text/event-stream`.

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

An input `stream(item)` takes items of the item schema's input type from the sender; the handler iterates parsed items.

Use the same codec on the handler and the link. A `stream()` procedure on the default `JsonCodec` (or `MultipartCodec`) answers `400 BAD_REQUEST` `Stream procedure requires a streaming codec` before the handler runs.

Put cleanup on the handler's `signal`, not in a generator's `finally`: a cancel calls the stream's `return()`, and an async generator that was never pulled completes on `return()` without running its body, so its `finally` never runs, and a generator waiting on an `await` between yields does not see `return()` until its next `yield`. Over HTTP the handler's `signal` is `request.signal`, which fires on disconnect when your host aborts it.

## Server-sent events

`SseCodec` frames root `AsyncIterable` output as `text/event-stream`. JSON calls stay JSON, and input streams stay `application/jsonl`. Contracts use the same `stream()`:

```ts
import { procedure } from '@ts-pf/contract'
import { z } from 'zod'
import { SseCodec, stream } from '@ts-pf/stream'

import { FetchHandler } from '@ts-pf/server-http'
import { FetchLink } from '@ts-pf/client-http'

const codec = new SseCodec() // optional { inner, keepAliveMs } — default 15_000; 0 disables pings
new FetchHandler(app, { codec })
new FetchLink({ url: '/rpc', codec })

procedure.output(stream(z.object({ token: z.string() })))
```

An `event: error` after the stream started rejects the iterator with a `PFError` whose `status` is `undefined` (the response was already 200); switch on `code`. `SSE_CONTENT_TYPE` is the response content type. `SseCodec` was `@ts-pf/sse` before 1.0.

## API

- `StreamCodec`, `stream()`
- `SseCodec`, `SSE_CONTENT_TYPE`

Wire spec: [`packages/protocol/PROTOCOL.md`](../protocol/PROTOCOL.md) (Message streams, SSE).
