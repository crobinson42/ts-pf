# @ts-pf/message-server

Opt-in `PortHandler` / `WsHandler` / `StdioHandler` for the same implemented `app` as `FetchHandler`. Adapters call `lookupProcedure` + `runProcedure`. They are not `HandlerPlugin`s and not a second RPC.

```ts
import { PortHandler } from '@ts-pf/message-server'

new PortHandler(app).bind(port, { context: { db } })
```

Stdio is a subpath, not on the main index:

```ts
import { StdioHandler } from '@ts-pf/message-server/stdio'

new StdioHandler(app).bind(
  { input: process.stdin, output: process.stdout },
  { context },
)
```

User owns listen / upgrade / spawn / Worker bootstrap. This package never depends on `@ts-pf/client`.

Wire spec: [`packages/protocol/PROTOCOL.md`](../protocol/PROTOCOL.md) (Message transports).
