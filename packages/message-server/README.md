# @ts-pf/message-server

Opt-in `PortHandler` / `WsHandler` / `StdioHandler` / `DuplexHandler` for the same implemented `app` as `FetchHandler`. Adapters call `lookupProcedure` + `runProcedure`. They are not `HandlerPlugin`s and not a second RPC. Pass call interceptors as `HandlerOptions.interceptors` (from `@ts-pf/server`); do not port HTTP `HandlerPlugin` here.

Agent skill: [`skills/ts-pf-message-server/`](skills/ts-pf-message-server/). Sync with `npx skills experimental_sync -y`.

```ts
import { applyPlugins, DedupePlugin } from '@ts-pf/server'
import { PortHandler } from '@ts-pf/message-server'

new PortHandler(app, {
  // Default key dedupes every unary call, writes included. Pass key to restrict to reads.
  interceptors: applyPlugins([new DedupePlugin({ key: readKey })]),
}).bind(port, { context: { db } })
```

Stdio is a subpath, not on the main index:

```ts
import { StdioHandler } from '@ts-pf/message-server/stdio'

new StdioHandler(app).bind(
  { input: process.stdin, output: process.stdout },
  { context },
)
```

Bring your own duplex. Any pipe that moves JSON text (Electron IPC, a Chrome runtime port, WebTransport, a Unix socket) is a `Duplex` from `@ts-pf/message` plus `DuplexHandler`; `PortHandler` / `WsHandler` / `StdioHandler` are exactly that over their built-in adapters. The handler owns the handshake, multiplexing, and cancel. Return a promise from `send` while your pipe is above its write mark (it must settle on close) and implement `pause` / `resume` if it can stop receiving; a duplex that does neither gets no slow-peer protection on that pipe:

```ts
import type { Duplex } from '@ts-pf/message'
import { DuplexHandler } from '@ts-pf/message-server'

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
new DuplexHandler(app).bind(duplex, { context: { db } })
```

User owns listen / upgrade / spawn / Worker bootstrap. This package never depends on `@ts-pf/client`.

## Backpressure

On by default, so a slow client cannot make the server accumulate memory or hold a handler forever. An output stream's producer is pulled one item at a time and parked at its `yield` while the duplex is above its write high-water mark (WebSocket `bufferedAmount` over 1 MiB, stdio `write()` refused). If the client still has not drained after `drainTimeout` (30 s), that call is aborted: the handler's `signal` fires, the iterator's `return()` runs once, the remaining frames are dropped, and the client receives a terminal `result` error `INTERNAL` / `Peer did not drain within 30000 ms` if the socket still accepts it. The connection stays open and other calls on it continue. It is not a handler failure, so `onError` is not called; `onStall` is (default: one `console.warn` on `aborted` only; a `paused` is normal flow control and is passed to a custom hook but not logged). On the input side, a `stream: true` call's `in-item` queue is bounded by the same mark (measured as frame text length) and the handler pauses reading the duplex (connection-wide) until the handler catches up, where the duplex can pause. `WsHandler` over npm `ws` 8.x is bounded in both directions (it exposes `bufferedAmount`, `pause()`, and `resume()`); so is `StdioHandler`. A `MessagePort` can neither report nor pause; server sockets that are not `ws` (Bun `ServerWebSocket`, uWebSockets.js, Deno) report `bufferedAmount` so producers park, but cannot pause reads, so the receive-side bound there rests on the peer.

```ts
import { PortHandler } from '@ts-pf/message-server'

new PortHandler(app, {
  backpressure: {
    highWaterMark: 1024 * 1024, // bytes; Infinity disables the receive-queue bound and the WebSocket mark (stdio's write mark is the Writable's own)
    drainTimeout: 30_000, // ms; 0 pauses forever
    onStall: ({ path, id, action, waitedMs }) => console.warn(path.join('.'), id, action, waitedMs), // default: one console.warn on 'aborted'; false silences
  },
}).bind(port, { context: { db } })
```

A bad value is a `TypeError` naming the option, thrown by the constructor. `BackpressureOptions` / `StallInfo` are re-exported from `@ts-pf/message`.

Wire spec: [`packages/protocol/PROTOCOL.md`](../protocol/PROTOCOL.md) (Message transports, "Backpressure").

## API

- `DuplexHandler`, `PortHandler`, `WsHandler`, `HandlerOptions`, `BackpressureOptions`, `StallInfo`, `WebSocketLike`
- `StdioHandler` from `./stdio` only
