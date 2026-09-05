# @ts-pf/message

Opt-in JSON text frames and `MessageSession` for message-oriented transports. Not an HTTP codec. Bindings live in [`@ts-pf/message-server`](../message-server) and [`@ts-pf/message-client`](../message-client).

Agent skill: [`skills/ts-pf-message/`](skills/ts-pf-message/). Sync with `npx skills experimental_sync -y`.

`createPortDuplex` / `createWsDuplex` / `WebSocketLike` adapt `MessagePort` and a `WebSocket`-like socket to `Duplex`. Stdio is a subpath:

```ts
import { createPortDuplex, createWsDuplex, type WebSocketLike } from '@ts-pf/message'
import { createStdioDuplex } from '@ts-pf/message/stdio'
```

Wire spec: [`packages/protocol/PROTOCOL.md`](../protocol/PROTOCOL.md) (Message transports).
