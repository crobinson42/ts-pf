---
name: ts-pf-message
description: Use when framing ts-pf over JSON text frames with MessageSession, Duplex, createPortDuplex, or createWsDuplex. Triggers: @ts-pf/message, MessageSession, encodeFrame, decodeFrame, createStdioDuplex.
---

# @ts-pf/message

Opt-in JSON text frames and `MessageSession`. Not an HTTP codec.

Install: `npm i @ts-pf/message@beta`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { createPortDuplex, createWsDuplex, type WebSocketLike } from '@ts-pf/message'
import { createStdioDuplex } from '@ts-pf/message/stdio'
```

Bindings live in `@ts-pf/message-server` / `@ts-pf/message-client`. Inject a `WebSocket` constructor — do not depend on the `ws` npm package. User owns listen / upgrade / spawn / Worker bootstrap.

## API

- `MessageSession`, `Duplex`, `encodeFrame`, `decodeFrame`
- `createMemoryDuplex`, `createPortDuplex`, `createWsDuplex`, `WebSocketLike`
- `errorFromEnvelope`, `localFailure`
- `createStdioDuplex` from `./stdio` only

## Pair with

- Server: `ts-pf-message-server`
- Client: `ts-pf-message-client`
- Wire: `@ts-pf/protocol` `PROTOCOL.md` (Message transports)

## Don't

- Use this as an HTTP `RpcCodec`.
- Depend on the `ws` npm package — inject a `WebSocket` constructor.
- Reconstruct HTTP status from `error.code` on this pipe.
