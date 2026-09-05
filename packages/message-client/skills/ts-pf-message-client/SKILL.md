---
name: ts-pf-message-client
description: Use when calling ts-pf over MessagePort, WebSocket, or stdio with PortLink, WsLink, or StdioLink. Triggers: @ts-pf/message-client, PortLink, WsLink, StdioLink.
---

# @ts-pf/message-client

`PortLink` / `WsLink` / `StdioLink` for the same `createClient(link)` as `FetchLink`.

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
import { StdioLink } from '@ts-pf/message-client/stdio'

const child = spawn(cmd, { stdio: ['pipe', 'pipe', 'inherit'] })
new StdioLink({ input: child.stdout, output: child.stdin })
```

User owns listen / upgrade / spawn / Worker bootstrap. Impls may have `close()`; do not add `close()` to `Link`.

## API

- `PortLink`, `WsLink`, `LinkOptions`, `WebSocketLike`
- `StdioLink` from `./stdio` only

## Pair with

- Client: `ts-pf-client`
- Server: `ts-pf-message-server`
- Frames: `ts-pf-message`

## Don't

- Depend on the `ws` npm package — inject a `WebSocket` constructor.
- Reconstruct HTTP status from `error.code`.
