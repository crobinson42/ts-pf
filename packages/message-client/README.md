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

Bring your own duplex. Any pipe that moves JSON text (Electron IPC, a Chrome runtime port, WebTransport, a Unix socket) is a `Duplex` from `@ts-pf/message` plus `DuplexLink`; `PortLink` / `WsLink` / `StdioLink` are exactly that over their built-in adapters. The link owns the handshake, ids, multiplexing, and cancel:

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

Wire spec: [`packages/protocol/PROTOCOL.md`](../protocol/PROTOCOL.md) (Message transports).

## API

- `DuplexLink`, `PortLink`, `WsLink`, `LinkOptions`, `WebSocketLike`
- `StdioLink` from `./stdio` only
