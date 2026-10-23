# @ts-pf/message-client

Opt-in `PortLink` / `WsLink` / `StdioLink` / `DuplexLink` for the same `createClient(link)` as `@ts-pf/client-http` `FetchLink`.

Agent skill: [`skills/ts-pf-message-client/`](skills/ts-pf-message-client/). Sync with `npx skills experimental_sync -y`.

```ts
import { createClient, RetryPlugin } from '@ts-pf/client'
import { PortLink } from '@ts-pf/message-client'

const client = createClient<typeof contract>(new PortLink({ port }), {
  plugins: [new RetryPlugin()],
})
```

Stdio is a subpath, not on the main index:

```ts
import { spawn } from 'node:child_process'
import { StdioLink } from '@ts-pf/message-client/stdio'

const child = spawn(cmd, { stdio: ['pipe', 'pipe', 'inherit'] })
new StdioLink({ input: child.stdout, output: child.stdin })
```

Bring your own duplex. Any pipe that moves JSON text (Electron IPC, a Chrome runtime port, WebTransport, a Unix socket) is a `Duplex` from `@ts-pf/message` plus `DuplexLink`; `PortLink` / `WsLink` / `StdioLink` are exactly that over their built-in adapters. The link owns the handshake, ids, multiplexing, and cancel. Return a promise from `send` while your pipe is above its write mark (it must settle on close) and implement `pause` / `resume` if it can stop receiving; a duplex that does neither gets no slow-peer protection on that pipe:

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
const client = createClient<typeof contract>(new DuplexLink({ duplex }))
```

User owns listen / upgrade / spawn / Worker bootstrap. Prod never depends on `@ts-pf/server`.

## Backpressure

On by default, mirroring the server. An `AsyncIterable` input is pumped one item at a time and parked while the duplex is above its write high-water mark (WebSocket `bufferedAmount` over 1 MiB, stdio `write()` refused). If the server still has not drained after `drainTimeout` (30 s) the call fails locally (`isLocalFailure` from `@ts-pf/client` is true; message `Peer did not drain within 30000 ms`), a `cancel` is sent if the socket accepts it, and the input iterator's `return()` runs once. An output stream you read is bounded by the same mark (measured as frame text length): while its queue is over it the link pauses reading the duplex (connection-wide) until you catch up, where the pipe can pause (stdio, npm `ws`); a server that times out on you ends the stream with `INTERNAL` / `Peer did not drain within …` after the items already buffered — that one came from the server, so `isLocalFailure` is false.

```ts
import { createClient } from '@ts-pf/client'
import { WsLink } from '@ts-pf/message-client'

const link = new WsLink({
  url: 'wss://example.com/rpc',
  WebSocket,
  backpressure: { highWaterMark: 1024 * 1024, drainTimeout: 30_000, onStall: false }, // defaults shown; onStall default is one console.warn on 'aborted'
})
const client = createClient<typeof contract>(link)
```

A bad value is a `TypeError` naming the option, thrown by the constructor. `BackpressureOptions` / `StallInfo` are re-exported from `@ts-pf/message`.

Wire spec: [`packages/protocol/PROTOCOL.md`](../protocol/PROTOCOL.md) (Message transports, "Backpressure").

## API

- `DuplexLink`, `PortLink`, `WsLink`, `LinkOptions`, `BackpressureOptions`, `StallInfo`, `WebSocketLike`
- `StdioLink` from `./stdio` only
