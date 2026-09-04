# ts-pf

TypeScript Procedure Factory — a contract-first, end-to-end type-safe RPC library.

oRPC-like DX without the dual-protocol platform. You write a contract, implement it on the server, and call it from a client that never imports server code.

Requires Node.js 18+.

## Packages

| Package | Role |
|---|---|
| [`@ts-pf/contract`](packages/contract) | `procedure` / `router`, schema adapters, nested routers, infer types |
| [`@ts-pf/protocol`](packages/protocol) | Portable JSON RPC envelope, `PFError`, codec |
| [`@ts-pf/server`](packages/server) | `createImplementer()`, middleware, `FetchHandler`, `createLocalClient()` |
| [`@ts-pf/client`](packages/client) | `createClient()`, `FetchLink`, `asResult()`, `isLocalFailure()` |
| [`@ts-pf/file`](packages/file) | Opt-in `MultipartCodec` for `File`/`Blob` attachments |
| [`@ts-pf/stream`](packages/stream) | Opt-in `StreamCodec` for root `AsyncIterable` (JSONL) |
| [`@ts-pf/sse`](packages/sse) | Opt-in `SseCodec` for SSE output framing of the same envelopes |
| [`@ts-pf/docs`](packages/docs) | Opt-in procedure catalog from a contract (`docs()`, `catalog()`) |
| [`@ts-pf/openapi`](packages/openapi) | Opt-in OpenAPI 3.1 from `catalog()` (POST JSON RPC) |
| [`@ts-pf/codegen`](packages/codegen) | Opt-in `.d.ts` from `catalog()` for split repos |
| [`@ts-pf/message`](packages/message) | Opt-in JSON text frames + `MessageSession` (not an HTTP codec) |
| [`@ts-pf/message-server`](packages/message-server) | Opt-in `PortHandler` / `WsHandler` / `StdioHandler` |
| [`@ts-pf/message-client`](packages/message-client) | Opt-in `PortLink` / `WsLink` / `StdioLink` |
| [`@ts-pf/swr`](packages/swr) | Opt-in SWR keys, fetchers, mutators, and matchers |

Wire spec: [packages/protocol/PROTOCOL.md](packages/protocol/PROTOCOL.md).

## Contract

```ts
import { procedure, router } from '@ts-pf/contract'
import { z } from 'zod'
import Type from 'typebox'

export const contract = router({
  planet: {
    list: procedure.output(z.array(z.object({ id: z.number(), name: z.string() }))),
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({ NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) } }),
    create: procedure
      .input(Type.Object({ name: Type.String() }))
      .output(Type.Object({ id: Type.Number(), name: Type.String() })),
  },
})
```

Schemas: any [Standard Schema](https://standardschema.dev/) library (Zod, Valibot, ArkType) or TypeBox. Register more with `registerSchemaAdapter`.

## Server

```ts
import { createImplementer, FetchHandler } from '@ts-pf/server'
import { PFError } from '@ts-pf/protocol'
import { contract } from './contract'

const impl = createImplementer(contract).$context<{ db: Db; req: Request }>()

const requireUser = impl.middleware(async ({ context, next }) => {
  const user = await auth(context.req)
  if (!user) throw new PFError({ code: 'UNAUTHORIZED', status: 401 })
  return next({ context: { user } })
})

export const app = impl.use(requireUser).router({
  planet: {
    list: impl.planet.list.handler(async ({ context }) => context.db.planets.all()),
    find: impl.planet.find.handler(async ({ input, context, errors }) => {
      const row = await context.db.planets.get(input.id)
      if (!row) throw errors.NOT_FOUND({ id: input.id })
      return row
    }),
    create: impl.planet.create.handler(async ({ input, context }) =>
      context.db.planets.create(input),
    ),
  },
})

const handler = new FetchHandler(app)

export default {
  async fetch(req: Request) {
    const result = await handler.handle(req, {
      prefix: '/rpc',
      context: (r) => ({ db, req: r }),
    })
    if (!result.matched) return new Response('Not Found', { status: 404 })
    return result.response
  },
}
```

`.use()` runs before input validation. `.useAfter()` runs after, with typed input.

## HTTP plugins

`FetchHandler` accepts opt-in `HandlerPlugin`s for origin concerns. Procedure middleware cannot see `Request` / `Response`.

```ts
import {
  CORSPlugin,
  FetchHandler,
  RequestHeadersPlugin,
  RequestLimitPlugin,
  ResponseHeadersPlugin,
  type RequestHeadersPluginContext,
  type ResponseHeadersPluginContext,
} from '@ts-pf/server'

const impl = createImplementer(contract).$context<
  { db: Db } & RequestHeadersPluginContext & ResponseHeadersPluginContext
>()

const handler = new FetchHandler(app, {
  plugins: [
    new CORSPlugin({ origin: ['https://app.example.com'] }),
    new RequestLimitPlugin({ maxBodySize: 1024 * 1024 }),
    new RequestHeadersPlugin(),
    new ResponseHeadersPlugin(),
  ],
})
```

`CORSPlugin` answers `OPTIONS` preflight (browsers will preflight: JSON + `x-ts-pf-protocol` are not CORS-safelisted). `RequestLimitPlugin` caps the HTTP body; multipart file caps stay on `MultipartCodec`. Header plugins inject optional `context.reqHeaders` / `context.resHeaders`.

## Client

```ts
import { asResult, createClient, FetchLink } from '@ts-pf/client'
import type { ContractClient } from '@ts-pf/contract'
import type { contract } from './contract'

export const client: ContractClient<typeof contract> = createClient(
  new FetchLink({ url: '/rpc' }),
)

const planet = await client.planet.find({ id: 1 })
const listed = await client.planet.list()
// optional second arg: { signal?: AbortSignal } (also on handler opts)

const result = await asResult(client.planet.find({ id: 1 }))
if (!result.ok && result.error.code === 'NOT_FOUND') {
  result.error.data.id
}
```

```ts
import { asResult, isLocalFailure } from '@ts-pf/client'

const result = await asResult(client.planet.find({ id: 1 }))
if (!result.ok) {
  if (isLocalFailure(result.error)) {
    // status === 0 — never reached the server
  } else if (result.error.code === 'NOT_FOUND') {
    result.error.data.id
  }
}
```

Any HTTP client parses the same `{ ok: false, error: { code, message, data? } }` envelope and switches on `error.code`. `asResult` is optional TypeScript DX.

Procedure catalogs are opt-in. Do not put this in the default happy path:

```ts
import { catalog, docs } from '@ts-pf/docs'

procedure.meta(docs({ description: 'Find a planet by id' }))
const spec = catalog(contract, { prefix: '/rpc' })
```

OpenAPI 3.1 is an opt-in projection of that catalog. Do not put this in the default happy path:

```ts
import { catalog, docs } from '@ts-pf/docs'
import { openapi } from '@ts-pf/openapi'

procedure.meta(docs({ description: 'Find a planet by id' }))
const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
  info: { title: 'Planet API', version: '1.0.0' },
})
```

Split-repo typed clients are an opt-in projection of that catalog too. Do not put this in the default happy path:

```ts
import { writeFileSync } from 'node:fs'
import { catalog } from '@ts-pf/docs'
import { emit } from '@ts-pf/codegen'
import { createClient, FetchLink } from '@ts-pf/client'
import type { Contract } from './contract.js'

writeFileSync('contract.d.ts', emit(catalog(contract, { prefix: '/rpc' })))
const client = createClient<Contract>(new FetchLink({ url: '/rpc' }))
```

Message transports are opt-in too. Do not put this in the default happy path:

```ts
import { PortHandler } from '@ts-pf/message-server'
import { PortLink } from '@ts-pf/message-client'
import { createClient } from '@ts-pf/client'

const { port1, port2 } = new MessageChannel()
new PortHandler(app).bind(port1, { context: { db } })
const client = createClient<typeof contract>(new PortLink({ port: port2 }))
```

SWR is opt-in too. Do not put this in the default happy path:

```ts
import { createSwr } from '@ts-pf/swr'
import useSWR from 'swr'

const swr = createSwr(client)
const { data } = useSWR(
  swr.planet.find.key({ input: { id: 1 } }),
  swr.planet.find.fetcher(),
)
```

## Why not oRPC?

oRPC is a dual RPC + OpenAPI platform with many adapters, serializers, and integrations. ts-pf keeps the contract-first DX and typed middleware. The catalog is the portable contract. `@ts-pf/openapi` is a document projection of `catalog()` (POST JSON RPC), not an OpenAPI runtime or REST handler. `@ts-pf/codegen` prints a `.d.ts` from that catalog for split-repo `createClient<Contract>` — not an OpenAPI runtime. TanStack Query and extra adapters stay later packages. SWR lives in `@ts-pf/swr`.

## Examples

Runnable apps in [`examples/`](examples/), from the happy path to a contract-first workshop, a [`10-docs`](examples/10-docs) catalog example, an opt-in [`11-message`](examples/11-message) MessagePort example, [`12-swr`](examples/12-swr) for `@ts-pf/swr`, [`13-openapi`](examples/13-openapi) for `@ts-pf/openapi`, and [`14-codegen`](examples/14-codegen) for `@ts-pf/codegen`.

See [`examples/README.md`](examples/README.md) for the learning path.

## Development

```sh
pnpm install
pnpm lint && pnpm type-check && pnpm test && pnpm build
```
