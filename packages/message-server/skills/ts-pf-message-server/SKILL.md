---
name: ts-pf-message-server
description: Use when serving ts-pf over MessagePort, WebSocket, stdio, or your own Duplex with PortHandler, WsHandler, StdioHandler, or DuplexHandler. Triggers: @ts-pf/message-server, PortHandler, WsHandler, StdioHandler, DuplexHandler.
---

# @ts-pf/message-server

`PortHandler` / `WsHandler` / `StdioHandler` / `DuplexHandler` for the same implemented `app` as `FetchHandler`.

Install: `npm i @ts-pf/message-server`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { applyPlugins, DedupePlugin } from '@ts-pf/server'
import { PortHandler } from '@ts-pf/message-server'

new PortHandler(app, {
  // Default key dedupes every unary call, writes included. Pass key to restrict to reads.
  interceptors: applyPlugins([new DedupePlugin({ key: readKey })]),
}).bind(port, { context: { db } })
```

```ts
import { StdioHandler } from '@ts-pf/message-server/stdio'

new StdioHandler(app).bind(
  { input: process.stdin, output: process.stdout },
  { context },
)
```

Bring your own duplex for any other pipe (Electron IPC, Chrome runtime port, WebTransport, Unix socket). Implement `Duplex` from `@ts-pf/message` — four functions that move JSON text — and bind it; `DuplexHandler` owns the handshake, multiplexing, and cancel, and `PortHandler` / `WsHandler` / `StdioHandler` are this over their built-in adapters:

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
const bound = new DuplexHandler(app).bind(duplex, { context: { db } })
bound.close() // closes the session and the duplex
```

Call interceptors are `HandlerOptions.interceptors` from `@ts-pf/server`. `HandlerOptions.validation` is the same `ProcedureValidation` for every handler: input checks default on, output and stream output items run only with `{ validation: { output: true } }`. Set it on the constructor, not on `bind()`. Pass `context` (value or `(info) => ctx`) on `bind()`, not per frame; `DuplexHandler`'s factory sees `{ meta }` only, the others add their `port` / `socket` / streams. `new PortHandler(app)` / `WsHandler` / `StdioHandler` / `DuplexHandler` infer the context type from `app` (the `$context<C>()` behind `impl.router()`), so `bind(..., { context })` is checked against it; an explicit `new PortHandler<AppCtx>(app)` still works when `AppCtx` satisfies it. A tree not produced by `impl.router()` infers `unknown`; use `impl.router()` to keep the check.

## API

- `DuplexHandler`, `PortHandler`, `WsHandler`, `HandlerOptions`, `WebSocketLike`
- `StdioHandler` from `./stdio` only

## Pair with

- App: `ts-pf-server`
- Client: `ts-pf-message-client`
- Frames: `ts-pf-message`

## Don't

- `HandlerPlugin` here (HTTP-only on `FetchHandler`).
- Reconstruct HTTP status from `error.code`.
- Copy the multiplexer for a new pipe — write a `Duplex` and use `DuplexHandler`.
