---
name: ts-pf-app
description: Use when building an app with ts-pf — picking packages, writing a contract, implementing a server, creating a client, composing feature slices, or choosing Fetch vs file upload vs stream vs SSE vs message vs docs vs OpenAPI vs codegen vs SWR vs mvc-kit. Triggers: ts-pf, @ts-pf, RPC, createImplementer, FetchHandler, createClient, FetchLink, MultipartCodec, StreamCodec, SseCodec, PortHandler, docs(), catalog(), openapi(), emit(), createSwr, bindClient, feature slice.
---

# ts-pf (app)

Contract-first TypeScript RPC. One procedure model; Fetch is an adapter. This skill is the catalog. Load `ts-pf-<pkg>` for package API and Don'ts.

Install: `npm i @ts-pf/contract @ts-pf/server @ts-pf/server-http @ts-pf/client @ts-pf/client-http`

Link for agents (after install or `npm update`): `npx skills experimental_sync -y`

`experimental_sync` copies skills from **installed** packages only. If `ts-pf-<pkg>` is not in the project skill dir: `npm i @ts-pf/<pkg> && npx skills experimental_sync -y`, then load that skill. Do not invent APIs from a package name. Do not assume an opt-in package is already a dependency.

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

## Compose

Feature slices own a contract and an implementation. A server nests them. Each client imports **that server's** contract only.

```ts
export const contract = router({
  planet: planetContract,
  star: starContract,
  auth: authContract,
})

const impl = createImplementer(contract).$context<AppCtx>()
export const app = impl.router({
  planet: planetApp,
  star: starApp,
  auth: authApp,
})
```

`planetApp` is `createImplementer(planetContract).$context<AppCtx>().router({ ... })`. Shared `AppCtx` on every slice; `$context` does not merge. Shared domain logic is plain functions, not a shared implementer.

Two servers (web vs mobile) are two composed contracts, not variants of one. Each server gets its own `createImplementer`. Pick procedures when the trees differ:

```ts
const users = router({
  list: procedure.output(z.array(UserRef)),
  listPopulated: procedure.output(z.array(UserPopulated)),
})
const usersImpl = createImplementer(users).$context<AppCtx>()
const usersApp = usersImpl.router({
  list: usersImpl.list.handler(listUsers),
  listPopulated: usersImpl.listPopulated.handler(listUsersPopulated),
})

const webContract = router({ users: router({ list: users.list }) })
const webImpl = createImplementer(webContract).$context<AppCtx>()
export const webApp = webImpl.router({ users: { list: usersApp.list } })
createClient<typeof webContract>(new FetchLink({ url: '/rpc' }))

const mobileContract = router({ users: router({ list: users.listPopulated }) })
const mobileImpl = createImplementer(mobileContract).$context<AppCtx>()
export const mobileApp = mobileImpl.router({
  users: { list: usersApp.listPopulated },
})
createClient<typeof mobileContract>(new FetchLink({ url: '/rpc' }))
```

No `mergeRouters`. No `compose()`. No lazy routers.

## Capabilities

| I want | Install | Then load |
|---|---|---|
| Contract / errors | `@ts-pf/contract` / `@ts-pf/protocol` | `ts-pf-contract` / `ts-pf-protocol` |
| Implement / call | `@ts-pf/server` / `@ts-pf/client` | `ts-pf-server` / `ts-pf-client` |
| HTTP Fetch | `@ts-pf/server-http` + `@ts-pf/client-http` | `ts-pf-server-http` / `ts-pf-client-http` |
| Codec helpers | `@ts-pf/http` | `ts-pf-http` |
| File / Blob attachments | `@ts-pf/file` | `ts-pf-file` |
| Root `AsyncIterable` (JSONL) | `@ts-pf/stream` | `ts-pf-stream` |
| SSE output framing | `@ts-pf/sse` (needs `stream()`) | `ts-pf-sse` |
| WS / stdio / MessagePort | `@ts-pf/message` + `-server` / `-client` | `ts-pf-message` / `-server` / `-client` |
| Procedure catalog | `@ts-pf/docs` | `ts-pf-docs` |
| OpenAPI 3.1 | `@ts-pf/openapi` | `ts-pf-openapi` |
| Split-repo `Contract` `.d.ts` | `@ts-pf/codegen` | `ts-pf-codegen` |
| SWR | `@ts-pf/swr` | `ts-pf-swr` |
| mvc-kit Resources | `@ts-pf/mvc-kit` | `ts-pf-mvc-kit` |

File, stream, SSE, and message are opt-in codecs/transports — default handler/link stay JSON. Docs, OpenAPI, codegen, SWR, and mvc-kit are other opt-in packages. Snippets below match the package-skill happy path; load `ts-pf-<pkg>` for API lists and Don'ts.

### File / Blob — `@ts-pf/file` → `ts-pf-file`

```ts
import { MultipartCodec } from '@ts-pf/file'
import { FetchHandler } from '@ts-pf/server-http'
import { FetchLink } from '@ts-pf/client-http'

const codec = new MultipartCodec() // optional { maxFiles, maxFileSize, inner }
new FetchHandler(app, { codec })
new FetchLink({ url: '/rpc', codec })
```

### Streams — `@ts-pf/stream` → `ts-pf-stream`

```ts
import { stream, StreamCodec } from '@ts-pf/stream'
import { FetchHandler } from '@ts-pf/server-http'
import { FetchLink } from '@ts-pf/client-http'

const codec = new StreamCodec()
new FetchHandler(app, { codec })
new FetchLink({ url: '/rpc', codec })

procedure.output(stream(z.object({ token: z.string() })))
```

### SSE — `@ts-pf/sse` → `ts-pf-sse`

```ts
import { stream } from '@ts-pf/stream'
import { SseCodec } from '@ts-pf/sse'
import { FetchHandler } from '@ts-pf/server-http'
import { FetchLink } from '@ts-pf/client-http'

const codec = new SseCodec() // optional { inner, keepAliveMs } — default 15_000; 0 disables pings
new FetchHandler(app, { codec })
new FetchLink({ url: '/rpc', codec })

procedure.output(stream(z.object({ token: z.string() })))
```

Contracts still use `stream()` from `@ts-pf/stream`.

### Message — `@ts-pf/message*` → `ts-pf-message` / `-server` / `-client`

```ts
import { PortHandler } from '@ts-pf/message-server'
import { PortLink } from '@ts-pf/message-client'
import { createClient } from '@ts-pf/client'

const { port1, port2 } = new MessageChannel()
new PortHandler(app).bind(port1, { context: { db } })
const client = createClient<typeof contract>(new PortLink({ port: port2 }))
```

Minimal Port example. Load `ts-pf-message-server` / `ts-pf-message-client` for WS / stdio (`./stdio`).

### Catalog / OpenAPI / codegen — `@ts-pf/docs` / `openapi` / `codegen`

```ts
import { docs, catalog } from '@ts-pf/docs'
import { openapi } from '@ts-pf/openapi'
import { emit, catalogHash } from '@ts-pf/codegen'
import { writeFileSync } from 'node:fs'

procedure.meta(docs({ description: 'Find a planet by id' }))
const spec = catalog(contract, { prefix: '/rpc' })
openapi(spec, { info: { title: 'Planet API', version: '1.0.0' } })
writeFileSync('contract.d.ts', emit(spec))
catalogHash(spec) // 'sha256:<hex>'
```

Serve `catalog.json` / OpenAPI JSON in userland, not from `FetchHandler`.

### SWR — `@ts-pf/swr` → `ts-pf-swr`

```ts
import { createSwr } from '@ts-pf/swr'
import useSWR from 'swr'

const swr = createSwr(client)
const { data, error } = useSWR(
  swr.planet.find.key({ input: { id: 123 } }),
  swr.planet.find.fetcher(),
)
```

### mvc-kit — `@ts-pf/mvc-kit` → `ts-pf-mvc-kit`

```ts
import { bindClient, issuesToFieldErrors } from '@ts-pf/mvc-kit'
import { asResult } from '@ts-pf/client'
import { Resource } from 'mvc-kit'

class PlanetsResource extends Resource<Planet> {
  private rpc = bindClient(client, this)

  async loadById(id: number) {
    this.upsert(await this.rpc.planet.find({ id }))
  }
}

const result = await asResult(this.rpc.planet.create(input))
if (!result.ok && result.error.code === 'VALIDATION') {
  this.form.setErrors(issuesToFieldErrors(result.error.data.issues))
}
```

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
| nested `router({ planet: planetContract })` | `mergeRouters` / `compose()` |

## Don't

- Import `@ts-pf/server` from client modules (or `@ts-pf/client` from server modules). The app still installs both.
- Serve REST, OpenAPI, or `catalog.json` from `FetchHandler`.
- Fold WebSocket or SSE into `FetchHandler`. No `.ws()` / `.stdio()` / `.port()` on procedures.
- ClientContext bags. No oRPC `*HandlerPlugin` class names.
- `mergeRouters` / `compose()` / lazy routers — nest `router({ planet: planetContract })`.
- Import an opt-in package because this catalog mentioned it — install, re-sync, then load `ts-pf-<pkg>`.
