---
name: ts-pf-message-server
description: Use when serving ts-pf over MessagePort, WebSocket, or stdio with PortHandler, WsHandler, or StdioHandler. Triggers: @ts-pf/message-server, PortHandler, WsHandler, StdioHandler.
---

# @ts-pf/message-server

`PortHandler` / `WsHandler` / `StdioHandler` for the same implemented `app` as `FetchHandler`.

Install: `npm i @ts-pf/message-server@beta`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { applyPlugins, DedupePlugin } from '@ts-pf/server'
import { PortHandler } from '@ts-pf/message-server'

new PortHandler(app, {
  interceptors: applyPlugins([new DedupePlugin()]),
}).bind(port, { context: { db } })
```

```ts
import { StdioHandler } from '@ts-pf/message-server/stdio'

new StdioHandler(app).bind(
  { input: process.stdin, output: process.stdout },
  { context },
)
```

Call interceptors are `HandlerOptions.interceptors` from `@ts-pf/server`. Pass `context` (value or `(info) => ctx`) on `bind()`, not per frame.

## API

- `PortHandler`, `WsHandler`, `HandlerOptions`, `WebSocketLike`
- `StdioHandler` from `./stdio` only

## Pair with

- App: `ts-pf-server`
- Client: `ts-pf-message-client`
- Frames: `ts-pf-message`

## Don't

- `HandlerPlugin` here (HTTP-only on `FetchHandler`).
- Reconstruct HTTP status from `error.code`.
