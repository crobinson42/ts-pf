# ts-pf

TypeScript Procedure Factory — a contract-first, end-to-end type-safe RPC library.

Source: [github.com/crobinson42/ts-pf](https://github.com/crobinson42/ts-pf)

**This procedure model, any pipe.** oRPC-like DX without the dual-protocol platform. You write a contract, implement it on the server, and call it from a client that never imports server code. Fetch is the default adapter, not the runtime.

Requires Node.js 18+.

## Install

```sh
npm install @ts-pf/contract @ts-pf/server @ts-pf/server-http @ts-pf/client @ts-pf/client-http
```

## Packages

| Package | Role |
|---|---|
| [`@ts-pf/contract`](packages/contract) | `procedure` / `router`, schema adapters, nested routers, infer types |
| [`@ts-pf/protocol`](packages/protocol) | Portable JSON envelope, `PFError`, `PROTOCOL_VERSION` |
| [`@ts-pf/server`](packages/server) | `createImplementer()`, middleware, `runProcedure`, `lookupProcedure`, `createLocalClient()`, call interceptors / `DedupePlugin` |
| [`@ts-pf/client`](packages/client) | `createClient()`, `Link`, `intercept()` / `CallPlugin`, `RetryPlugin` / `DedupePlugin` / `CachePlugin`, `asResult()`, `isLocalFailure()` |
| [`@ts-pf/http`](packages/http) | HTTP wire helpers: `JSONCodec`, `RpcCodec`, `PROTOCOL_HEADER`, path helpers, `httpStatus` |
| [`@ts-pf/server-http`](packages/server-http) | `FetchHandler`, `HandlerPlugin` (CORS / limits / headers) |
| [`@ts-pf/client-http`](packages/client-http) | `FetchLink`, Fetch interceptors |
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
| [`@ts-pf/mvc-kit`](packages/mvc-kit) | Opt-in `bindClient` + `issuesToFieldErrors` for mvc-kit Resources |

Wire spec: [packages/protocol/PROTOCOL.md](packages/protocol/PROTOCOL.md).

## Agent skills

Each `@ts-pf/*` package ships `skills/ts-pf-<name>/` (plus `ts-pf-app` on `@ts-pf/contract`). After install or `npm update`:

```sh
npx skills experimental_sync -y
```

That links the skills into the project's agent skill dirs. Put the command on the **app** `postinstall` if you want it automatic — never on `@ts-pf/*`.

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
import { createImplementer } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
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
import { createImplementer } from '@ts-pf/server'
import {
  CORSPlugin,
  FetchHandler,
  RequestHeadersPlugin,
  RequestLimitPlugin,
  ResponseHeadersPlugin,
  type RequestHeadersPluginContext,
  type ResponseHeadersPluginContext,
} from '@ts-pf/server-http'

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

`FetchHandler.plugins` are HTTP `HandlerPlugin`s. Server call interceptors (`CallInterceptor` / `DedupePlugin` / `onStart` from `@ts-pf/server`) go on `{ interceptors }` — a different list. Client retry/cache live on `createClient`.

```ts
import { applyPlugins, DedupePlugin, onStart } from '@ts-pf/server'
import { CORSPlugin, FetchHandler } from '@ts-pf/server-http'

const interceptors = applyPlugins(
  [new DedupePlugin()],
  [onStart(({ path }) => console.log(path.join('.')))],
)

new FetchHandler(app, {
  plugins: [new CORSPlugin({ origin: ['https://app.example.com'] })],
  interceptors,
})
```

`createLocalClient(app, { context, plugins, interceptors })` accepts `CallPlugin`s directly. `FetchHandler` / `PortHandler` take `{ interceptors }` only — pass `applyPlugins([new DedupePlugin()], …)` for plugins. They do not take `HandlerPlugin` as call interceptors.

## Client

```ts
import {
  asResult,
  createClient,
  DedupePlugin,
  onStart,
  RetryPlugin,
} from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { ContractClient } from '@ts-pf/contract'
import type { contract } from './contract'

export const client: ContractClient<typeof contract> = createClient(
  new FetchLink({ url: '/rpc' }),
  {
    plugins: [new RetryPlugin(), new DedupePlugin()],
    interceptors: [onStart(({ path }) => console.log(path.join('.')))],
  },
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
    // local: true — never reached the server
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
import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
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

mvc-kit is opt-in too. Do not put this in the default happy path:

```ts
import { bindClient } from '@ts-pf/mvc-kit'
import { Resource } from 'mvc-kit'

class PlanetsResource extends Resource<Planet> {
  private rpc = bindClient(client, this)
  async loadById(id: number) {
    this.upsert(await this.rpc.planet.find({ id }))
  }
}
```

## Why not oRPC?

oRPC is a dual RPC + OpenAPI platform with many adapters, serializers, and integrations. ts-pf keeps the contract-first DX and typed middleware. The catalog is the portable contract. `@ts-pf/openapi` is a document projection of `catalog()` (POST JSON RPC), not an OpenAPI runtime or REST handler. `@ts-pf/codegen` prints a `.d.ts` from that catalog for split-repo `createClient<Contract>` — not an OpenAPI runtime. TanStack Query and extra adapters stay later packages. SWR lives in `@ts-pf/swr`. mvc-kit Resource helpers live in `@ts-pf/mvc-kit`.

## Examples

Runnable apps in [`examples/`](examples/): [`hello`](examples/hello) (Fetch), [`message`](examples/message) (MessagePort), [`stream`](examples/stream) (`StreamCodec`), [`plugins`](examples/plugins) (`CallPlugin` / `CallInterceptor`).

## Development

```sh
npm install
npm run lint && npm run check:skills && npm run type-check && npm test && npm run build
```

A public API / name / happy-path change updates `packages/<pkg>/skills/ts-pf-<pkg>/SKILL.md` in the same PR (`npm run check:skills`).

Releases use [Changesets](https://github.com/changesets/changesets) (`latest` on npm). See [`.changeset/README.md`](.changeset/README.md). A PR that changes a published `packages/*` package must include a changeset (`npx changeset`).
