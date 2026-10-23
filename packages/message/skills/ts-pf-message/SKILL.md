---
name: ts-pf-message
description: Use when framing ts-pf over JSON text frames with MessageSession, Duplex, createPortDuplex, createWsDuplex, or createPushQueue. Triggers: @ts-pf/message, MessageSession, encodeFrame, decodeFrame, createStdioDuplex, createPushQueue.
---

# @ts-pf/message

Opt-in JSON text frames and `MessageSession`. Not an HTTP codec.

Install: `npm i @ts-pf/message`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { createPortDuplex, createWsDuplex, type WebSocketLike } from '@ts-pf/message'
import { createStdioDuplex } from '@ts-pf/message/stdio'
```

Bindings live in `@ts-pf/message-server` / `@ts-pf/message-client`. Inject a `WebSocket` constructor — do not depend on the `ws` npm package. User owns listen / upgrade / spawn / Worker bootstrap.

`errorFromEnvelope({ code, message, data? })` builds a `PFError` with `status` left `undefined` — frames carry no HTTP status and none is synthesized. Switch on `code`.

`createPushQueue<T>()` turns frames into an `AsyncIterable<T>` for a custom binding: `push(value)` from the frame callback, `end()` to complete after the buffered values, `fail(error)` to reject the next pull instead. One pending `next()` at a time (one `for await` consumer); `end` / `fail` are one-shot and later calls are ignored. The first-party server (streamed input) and client (streamed output) use the same queue.

`localFailure` is a deprecated re-export; import it from `@ts-pf/protocol`.

## API

- `MessageSession`, `Duplex`, `encodeFrame`, `decodeFrame`
- `createMemoryDuplex`, `createPortDuplex`, `createWsDuplex`, `WebSocketLike`
- `createPushQueue`, `PushQueue`
- `errorFromEnvelope`; `localFailure` (deprecated — use `@ts-pf/protocol`)
- `createStdioDuplex` from `./stdio` only

## Pair with

- Server: `ts-pf-message-server`
- Client: `ts-pf-message-client`
- Wire: `@ts-pf/protocol` `PROTOCOL.md` (Message transports)

## Don't

- Use this as an HTTP `RpcCodec`.
- Depend on the `ws` npm package — inject a `WebSocket` constructor.
- Reconstruct HTTP status from `error.code` on this pipe.
- Share one `PushQueue` between two `for await` loops — it holds one pending pull.
