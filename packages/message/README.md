# @ts-pf/message

Opt-in JSON text frames and `MessageSession` for message-oriented transports. Not an HTTP codec. Bindings live in [`@ts-pf/message-server`](../message-server) and [`@ts-pf/message-client`](../message-client).

Agent skill: [`skills/ts-pf-message/`](skills/ts-pf-message/). Sync with `npx skills experimental_sync -y`.

`createPortDuplex` / `createWsDuplex` / `WebSocketLike` adapt `MessagePort` and a `WebSocket`-like socket to `Duplex`. Stdio is a subpath:

```ts
import { createPortDuplex, createWsDuplex, type WebSocketLike } from '@ts-pf/message'
import { createStdioDuplex } from '@ts-pf/message/stdio'
```

`createPushQueue()` is the primitive a transport adapter uses to turn frames into an `AsyncIterable`: `push(value)` from a frame callback, `end()` to complete, `fail(error)` to reject the next pull. Both closes are one-shot. `@ts-pf/message-server` (streamed input) and `@ts-pf/message-client` (streamed output) use it; so can a custom `Duplex` binding.

```ts
import { createPushQueue } from '@ts-pf/message'

const items = createPushQueue<number>()
items.push(1)
items.push(2)
items.end() // or items.fail(error)
for await (const item of items) console.log(item) // 1, 2
```

`localFailure` is still re-exported for compatibility but is deprecated — import it from `@ts-pf/protocol`.

Wire spec: [`packages/protocol/PROTOCOL.md`](../protocol/PROTOCOL.md) (Message transports).

## API

- `MessageSession`, `Duplex`, `encodeFrame`, `decodeFrame`
- `createMemoryDuplex`, `createPortDuplex`, `createWsDuplex`, `WebSocketLike`
- `createPushQueue`, `PushQueue`
- `errorFromEnvelope`; `localFailure` (deprecated re-export — use `@ts-pf/protocol`)
- `createStdioDuplex` from `./stdio` only
