---
name: ts-pf-app
description: Use when building an app with ts-pf — picking packages, writing a contract, implementing a server, creating a client, or choosing Fetch vs message vs stream. Triggers: ts-pf, @ts-pf, RPC, createImplementer, FetchHandler, createClient, FetchLink.
---

# ts-pf (app)

Contract-first TypeScript RPC. One procedure model; Fetch is an adapter. Load a `ts-pf-<pkg>` skill for package details.

Install: `npm i @ts-pf/contract@beta @ts-pf/server@beta @ts-pf/server-http@beta @ts-pf/client@beta @ts-pf/client-http@beta`

Link for agents (after install or `npm update`): `npx skills experimental_sync -y`

## Do

```ts
import { procedure, router } from '@ts-pf/contract'
import { createImplementer } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import { z } from 'zod'

export const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({ NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) } }),
  },
})

const impl = createImplementer(contract).$context<{ db: Db }>()
export const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input, context, errors }) => {
      const row = await context.db.planets.get(input.id)
      if (!row) throw errors.NOT_FOUND({ id: input.id })
      return row
    }),
  },
})

const handler = new FetchHandler(app)
await handler.handle(request, { prefix: '/rpc', context: { db } })

const client = createClient<typeof contract>(new FetchLink({ url: '/rpc' }))
await client.planet.find({ id: 1 })
```

Name the implemented router `app`. Wire: `@ts-pf/protocol` `PROTOCOL.md`.

## Packages

| Want | Package | Skill |
|---|---|---|
| Contract | `@ts-pf/contract` | `ts-pf-contract` |
| Errors / envelope | `@ts-pf/protocol` | `ts-pf-protocol` |
| Implement | `@ts-pf/server` | `ts-pf-server` |
| Call | `@ts-pf/client` | `ts-pf-client` |
| HTTP Fetch | `@ts-pf/server-http` + `@ts-pf/client-http` | `ts-pf-server-http` / `ts-pf-client-http` |
| Codec helpers | `@ts-pf/http` | `ts-pf-http` |
| File/Blob | `@ts-pf/file` | `ts-pf-file` |
| AsyncIterable | `@ts-pf/stream` | `ts-pf-stream` |
| SSE output | `@ts-pf/sse` | `ts-pf-sse` |
| Catalog | `@ts-pf/docs` | `ts-pf-docs` |
| OpenAPI 3.1 | `@ts-pf/openapi` | `ts-pf-openapi` |
| Split-repo `.d.ts` | `@ts-pf/codegen` | `ts-pf-codegen` |
| WS / stdio / port | `@ts-pf/message*` | `ts-pf-message` / `-server` / `-client` |
| SWR | `@ts-pf/swr` | `ts-pf-swr` |
| mvc-kit | `@ts-pf/mvc-kit` | `ts-pf-mvc-kit` |

File, stream, SSE, message, docs, SWR, mvc-kit are opt-in. Default handler/link stay JSON.

## Names

| Use | Not |
|---|---|
| `procedure` / `router` | `oc` |
| `createImplementer` | `implement` / `os` |
| `FetchHandler` / `PortHandler` / `WsHandler` / `StdioHandler` | `RPCHandler` |
| `CORSPlugin` / `RetryPlugin` / `DedupePlugin` / `CachePlugin` | `*HandlerPlugin` / `*LinkPlugin` (`HandlerPlugin` and `CallPlugin` stay) |
| `FetchLink` / `PortLink` / `WsLink` / `StdioLink` | `RPCLink` |
| `createLocalClient` | `createRouterClient` |
| `asResult` | `safe` |
| `PortHandler.bind` | `upgrade` |
| `stream()` | `eventIterator` |
| `createSwr` | `createSWRUtils` / `swrUtils` |
| `bindClient` | `bind` as a client wrapper / `createMvc` |
| `emit` / `catalogHash` | `generate` / `compile`; `digest` as the only hash name |
| `ts-pf-codegen` | `pf` |
| generated `Contract` | `AppRouter` |
| implemented `app` | `router` (that name is the contract helper) |

## Don't

- Import `@ts-pf/server` from client modules (or `@ts-pf/client` from server modules). The app still installs both.
- Serve REST, OpenAPI, or `catalog.json` from `FetchHandler`.
- Fold WebSocket or SSE into `FetchHandler`. No `.ws()` / `.stdio()` / `.port()` on procedures.
- ClientContext bags. No oRPC `*HandlerPlugin` class names.
