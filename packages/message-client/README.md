# @ts-pf/message-client

Opt-in `PortLink` / `WsLink` / `StdioLink` for the same `createClient(link)` as `@ts-pf/client-http` `FetchLink`.

```ts
import { createClient } from '@ts-pf/client'
import { PortLink } from '@ts-pf/message-client'

const client = createClient<typeof contract>(new PortLink({ port }))
```

Stdio is a subpath, not on the main index:

```ts
import { StdioLink } from '@ts-pf/message-client/stdio'

const child = spawn(cmd, { stdio: ['pipe', 'pipe', 'inherit'] })
new StdioLink({ input: child.stdout, output: child.stdin })
```

User owns listen / upgrade / spawn / Worker bootstrap. Prod never depends on `@ts-pf/server`.

Wire spec: [`packages/protocol/PROTOCOL.md`](../protocol/PROTOCOL.md) (Message transports).
