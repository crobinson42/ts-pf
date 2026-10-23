---
name: ts-pf-message-client
description: Use when calling ts-pf over MessagePort, WebSocket, stdio, or your own Duplex with PortLink, WsLink, StdioLink, or DuplexLink. Triggers: @ts-pf/message-client, PortLink, WsLink, StdioLink, DuplexLink.
---

# @ts-pf/message-client

`PortLink` / `WsLink` / `StdioLink` / `DuplexLink` for the same `createClient(link)` as `FetchLink`.

Install: `npm i @ts-pf/message-client`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { createClient, RetryPlugin } from '@ts-pf/client'
import { PortLink, WsLink } from '@ts-pf/message-client'

const client = createClient<typeof contract>(new PortLink({ port }), {
  plugins: [new RetryPlugin()],
})

new WsLink({ url: 'wss://example.com/rpc', WebSocket }) // or { socket }
```

```ts
import { spawn } from 'node:child_process'
import { StdioLink } from '@ts-pf/message-client/stdio'

const child = spawn(cmd, { stdio: ['pipe', 'pipe', 'inherit'] })
new StdioLink({ input: child.stdout, output: child.stdin })
```

Bring your own duplex for any other pipe (Electron IPC, Chrome runtime port, WebTransport, Unix socket). Implement `Duplex` from `@ts-pf/message` — four functions that move JSON text — and hand it to `DuplexLink`, which owns the handshake, ids, multiplexing, and cancel; `PortLink` / `WsLink` / `StdioLink` are this over their built-in adapters. Same `LinkOptions` (`meta`, `maxFrameBytes`, `helloTimeoutMs`); `close()` closes the duplex:

```ts
import { createClient } from '@ts-pf/client'
import type { Duplex } from '@ts-pf/message'
import { DuplexLink } from '@ts-pf/message-client'

declare const ipc: {
  send(text: string): void
  on(event: 'message' | 'close', handler: (text: string) => void): () => void
  close(): void
}

const duplex: Duplex = {
  send: (text) => ipc.send(text),
  onMessage: (handler) => ipc.on('message', handler),
  onClose: (handler) => ipc.on('close', handler),
  close: () => ipc.close(),
}
const link = new DuplexLink({ duplex, meta: { token: 'abc' } })
const client = createClient<typeof contract>(link)
link.close()
```

User owns listen / upgrade / spawn / Worker bootstrap. Impls may have `close()`; do not add `close()` to `Link`.

## API

- `DuplexLink`, `PortLink`, `WsLink`, `LinkOptions`, `WebSocketLike`
- `StdioLink` from `./stdio` only

## Pair with

- Client: `ts-pf-client`
- Server: `ts-pf-message-server`
- Frames: `ts-pf-message`

## Don't

- Depend on the `ws` npm package — inject a `WebSocket` constructor.
- Reconstruct HTTP status from `error.code`.
- Copy the multiplexer for a new pipe — write a `Duplex` and use `DuplexLink`.
