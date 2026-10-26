---
name: ts-pf-message-client
description: "Use when calling ts-pf over MessagePort, WebSocket, stdio, or your own Duplex with PortLink, WsLink, StdioLink, or DuplexLink. Triggers: @ts-pf/message-client, PortLink, WsLink, StdioLink, DuplexLink."
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

Bring your own duplex for any other pipe (Electron IPC, Chrome runtime port, WebTransport, Unix socket). Implement `Duplex` from `@ts-pf/message` — four functions that move JSON text — and hand it to `DuplexLink`, which owns the handshake, ids, multiplexing, and cancel; `PortLink` / `WsLink` / `StdioLink` are this over their built-in adapters. Same `LinkOptions` (`meta`, `maxFrameBytes`, `helloTimeoutMs`, `backpressure`); `close()` closes the duplex. Return a promise from `send` while your pipe is above its write mark (it must settle on close) and implement `pause` / `resume` if it can stop receiving; a duplex that does neither gets no slow-peer protection on that pipe:

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

Slow servers are handled by default (`LinkOptions.backpressure`, the same `{ highWaterMark?, drainTimeout?, onStall? }` as the server; 1 MiB / 30 s / one `console.warn` on `aborted` only, and a throwing `onStall` is swallowed): an `AsyncIterable` input is pumped one item at a time and parked while the duplex is over its mark; after `drainTimeout` the call fails locally (`isLocalFailure` from `@ts-pf/client` is true; `Peer did not drain within 30000 ms`), `cancel` goes out, and the input iterator's `return()` runs once. Output streams you read are bounded by the same mark (frame text length) — the link pauses reads (connection-wide) while your `for await` lags, where the pipe can pause. A server that gives up on a slow reader ends the stream with `INTERNAL` / `Peer did not drain within …` after the buffered items; that one is not local. `drainTimeout: 0` waits forever; `highWaterMark: Infinity` disables the receive-queue bound and the WebSocket `bufferedAmount` mark (stdio's write mark is the `Writable`'s own); `onStall: false` silences; a bad value throws from the constructor.

## API

- `DuplexLink`, `PortLink`, `WsLink`, `LinkOptions`, `BackpressureOptions`, `StallInfo`, `WebSocketLike`
- `StdioLink` from `./stdio` only

## Pair with

- Client: `ts-pf-client`
- Server: `ts-pf-message-server`
- Frames: `ts-pf-message`

## Don't

- Depend on the `ws` npm package — inject a `WebSocket` constructor.
- Reconstruct HTTP status from `error.code`.
- Copy the multiplexer for a new pipe — write a `Duplex` and use `DuplexLink`.
- Retry a `Peer did not drain` failure blindly — the server stopped reading; fix the consumer or raise `drainTimeout`.
