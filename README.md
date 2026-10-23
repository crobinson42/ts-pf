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
| [`@ts-pf/contract`](packages/contract) | `procedure` / `router`, schema adapters, nested routers, typed errors, infer types |
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
| [`@ts-pf/astro`](packages/astro) | Opt-in Astro endpoint (`createAstroHandler`) and page caller (`createAstroLocalClient` / `createAstroClient`) |

Wire spec: [packages/protocol/PROTOCOL.md](packages/protocol/PROTOCOL.md).

## Agent skills

Each `@ts-pf/*` package ships `skills/ts-pf-<name>/`. `@ts-pf/contract` also ships the hub catalog `ts-pf-app` (Fetch happy path plus opt-in capabilities the app has not installed yet). Sync copies skills from **installed** packages. After install or `npm update`:

```sh
npx skills experimental_sync -y
```

That links the skills into the project's agent skill dirs. Put the command on the **app** `postinstall` if you want it automatic — never on `@ts-pf/*`. Index of every consumer skill: [`skills/README.md`](skills/README.md) (not published, not an authoring home). Do not add a published `@ts-pf/skills` package.

## Contract

```ts
// contract.ts
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
// server.ts
import { createImplementer } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { PFError } from '@ts-pf/protocol'
import { contract } from './contract.js'

// Declare every key middleware will add (`user`) here. `next({ context })`
// takes a Partial of this type; it does not infer new keys.
export type AppCtx = { db: Db; req: Request; user?: User }

const impl = createImplementer(contract).$context<AppCtx>()

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

// `FetchHandler` infers `AppCtx` from `app`, so the `context` passed to
// handle() (next section) is checked against it.
export const handler = new FetchHandler(app)
```

`Db`, `User`, `db`, and `auth()` are your app's types and values. `$context<AppCtx>()` is the only source of context types: middleware runtime-merges what it passes to `next({ context })` but does not widen the type, so declare optional keys such as `user?` up front. `impl.router()` carries that type on `app`: `FetchHandler`, the message handlers, `createLocalClient`, and `@ts-pf/astro` read it from there and reject a `context` that does not match (a plain object of handlers that did not go through `impl.router()` infers `unknown` instead), and `impl.router()` itself rejects a missing or extra key, a handler placed under another procedure's key, or a slice built with a different `$context`, naming the key in the error.

`.use()` runs before input validation. `.useAfter()` runs after, with typed input when the input check ran. Input schemas are checked unless `validation.input` is `false`. Output schemas, including stream output items, are checked only when `validation.output` is `true` (`FetchHandler`, message handlers, `createLocalClient`, and `runProcedure`).

## Serving FetchHandler

`FetchHandler` speaks Fetch `Request` / `Response` only. Any runtime or framework that hands you a `Request` can host it: call `handler.handle(request, { prefix, context })` and fall through when `result.matched` is `false` so your other routes still answer. ts-pf ships no Node `IncomingMessage` adapter and no generic framework adapters (the one opt-in integration is [`@ts-pf/astro`](packages/astro)); `@hono/node-server`, `srvx`, Hono, and Next.js below are userland packages, not `@ts-pf/*`.

Write the entry point once:

```ts
// rpc.ts
import { handler } from './server.js'

export async function rpc(request: Request): Promise<Response> {
  const result = await handler.handle(request, {
    prefix: '/rpc',
    context: (req) => ({ db, req }),
  })
  if (!result.matched) return new Response('Not Found', { status: 404 })
  return result.response
}
```

Cloudflare Workers — the module `fetch` export:

```ts
import { rpc } from './rpc.js'

export default { fetch: rpc }
```

Bun:

```ts
import { rpc } from './rpc.js'

Bun.serve({ fetch: rpc, port: 3000 })
```

Deno:

```ts
import { rpc } from './rpc.js'

Deno.serve(rpc)
```

Node.js has no built-in Fetch server. Use a small userland bridge — `@hono/node-server`:

```ts
import { serve } from '@hono/node-server'
import { rpc } from './rpc.js'

serve({ fetch: rpc, port: 3000 })
```

or `srvx`:

```ts
import { serve } from 'srvx'
import { rpc } from './rpc.js'

serve({ fetch: rpc, port: 3000 })
```

Inside a Hono app, mount it as a route and let `c.notFound()` handle the miss:

```ts
import { Hono } from 'hono'
import { handler } from './server.js'

const web = new Hono()

web.all('/rpc/*', async (c) => {
  const result = await handler.handle(c.req.raw, {
    prefix: '/rpc',
    context: (req) => ({ db, req }),
  })
  if (!result.matched) return c.notFound()
  return result.response
})

export default web
```

Next.js App Router — a catch-all route handler (`POST` only; add `OPTIONS` if `CORSPlugin` answers preflight):

```ts
// app/rpc/[...path]/route.ts
import { handler } from '../../../server.js'

export const POST = async (req: Request) => {
  const result = await handler.handle(req, {
    prefix: '/rpc',
    context: (r) => ({ db, req: r }),
  })
  if (!result.matched) return new Response('Not Found', { status: 404 })
  return result.response
}
```

Astro has a first-party endpoint helper in [`@ts-pf/astro`](packages/astro) (`createAstroHandler`).

## Compose

`router()` nests slice contracts. `impl.router()` nests finished slice implementations. One server, one contract; the client never sees the slices.

```ts
import { router } from '@ts-pf/contract'
import { createImplementer } from '@ts-pf/server'

export const contract = router({
  planet: planetContract,
  star: starContract,
})

const impl = createImplementer(contract).$context<AppCtx>()
export const app = impl.router({
  planet: planetApp,
  star: starApp,
})
```

`planetApp` comes from `createImplementer(planetContract).$context<AppCtx>().router({ ... })`. Use the same `AppCtx` on every slice.

A second server (web vs mobile) is a second composed contract — pick procedures when the trees differ (`router({ list: users.list })` vs `router({ list: users.listPopulated })`, then `{ list: usersApp.list }` vs `{ list: usersApp.listPopulated }`). Shared domain logic stays plain functions. No `mergeRouters`.

## HTTP plugins

`FetchHandler` accepts opt-in `HandlerPlugin`s for origin concerns. Procedure middleware cannot see `Request` / `Response`.

```ts
import {
  CORSPlugin,
  FetchHandler,
  RequestHeadersPlugin,
  RequestLimitPlugin,
  ResponseHeadersPlugin,
} from '@ts-pf/server-http'
import { app, type AppCtx } from './server.js'

const handler = new FetchHandler<AppCtx>(app, {
  plugins: [
    new CORSPlugin({ origin: ['https://app.example.com'] }),
    new RequestLimitPlugin({ maxBodySize: 1024 * 1024 }),
    new RequestHeadersPlugin(),
    new ResponseHeadersPlugin(),
  ],
})
```

`CORSPlugin` answers `OPTIONS` preflight (browsers will preflight: JSON + `x-ts-pf-protocol` are not CORS-safelisted). `RequestLimitPlugin` caps the HTTP body; multipart file caps stay on `MultipartCodec`. Header plugins inject optional `context.reqHeaders` / `context.resHeaders`; intersect `RequestHeadersPluginContext` / `ResponseHeadersPluginContext` (exported from `@ts-pf/server-http`) into the type you pass to `$context<…>()` so handlers see them.

`FetchHandler.plugins` are HTTP `HandlerPlugin`s. Server call interceptors (`CallInterceptor` / `DedupePlugin` / `onStart` from `@ts-pf/server`) go on `{ interceptors }` — a different list. Client retry/cache live on `createClient`.

```ts
import { applyPlugins, DedupePlugin, onStart } from '@ts-pf/server'
import { CORSPlugin, FetchHandler } from '@ts-pf/server-http'
import { app, type AppCtx } from './server.js'

// Dedupe reads only. The default key covers every unary call, writes included.
const readKey = ({ path, input }: { path: string[]; input: unknown }) =>
  path.join('.') === 'planet.find' ? JSON.stringify([path, input]) : undefined

const interceptors = applyPlugins(
  [new DedupePlugin({ key: readKey })],
  [onStart(({ path }) => console.log(path.join('.')))],
)

new FetchHandler<AppCtx>(app, {
  plugins: [new CORSPlugin({ origin: ['https://app.example.com'] })],
  interceptors,
})
```

`createLocalClient(app, { context, plugins, interceptors })` accepts `CallPlugin`s directly. `FetchHandler` / `PortHandler` take `{ interceptors }` only — pass `applyPlugins([new DedupePlugin({ key })], …)` for plugins. They do not take `HandlerPlugin` as call interceptors.

## Client

```ts
// client.ts
import { asResult, createClient, onStart, RetryPlugin } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { ContractClient } from '@ts-pf/contract'
import type { contract } from './contract.js'

export const client: ContractClient<typeof contract> = createClient(
  new FetchLink({ url: '/rpc' }),
  {
    plugins: [new RetryPlugin()],
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
import { client } from './client.js'

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

### Retry, dedupe, cache

`RetryPlugin`, `DedupePlugin`, and `CachePlugin` are `CallPlugin`s on `createClient(link, { plugins })`. `RetryPlugin` retries local failures (not aborts) up to 3 times by default. A connection dropped *after* the request was sent is a local failure too, so the default can re-send a write that already landed; pass `retry` to exclude non-idempotent procedures.

`DedupePlugin` and `CachePlugin` are **not** read-only by default. Their default key is `JSON.stringify([path, input])` for every unary call, mutations included — two concurrent `planet.create({ name: 'x' })` calls would share one request and resolve to the same id. Pass `key` and return `undefined` for anything that is not a read. The same applies to the server `DedupePlugin` in `@ts-pf/server`. Runnable form: [`examples/plugins/src/read-key.ts`](examples/plugins/src/read-key.ts).

```ts
import { CachePlugin, createClient, DedupePlugin, RetryPlugin } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { contract } from './contract.js'

// Only planet.find shares in-flight work or a cache entry. Writes get undefined.
const readKey = ({ path, input }: { path: string[]; input: unknown }) =>
  path.join('.') === 'planet.find' ? JSON.stringify([path, input]) : undefined

const client = createClient<typeof contract>(new FetchLink({ url: '/rpc' }), {
  plugins: [
    new RetryPlugin(),
    new DedupePlugin({ key: readKey }),
    new CachePlugin({ ttl: 5_000, key: readKey }),
  ],
})
```

Procedure catalogs are opt-in. Do not put this in the default happy path:

```ts
import { procedure } from '@ts-pf/contract'
import { catalog, docs } from '@ts-pf/docs'
import { contract } from './contract.js'

procedure.meta(docs({ description: 'Find a planet by id' }))
const spec = catalog(contract, { prefix: '/rpc' })
```

OpenAPI 3.1 is an opt-in projection of that catalog. Do not put this in the default happy path:

```ts
import { procedure } from '@ts-pf/contract'
import { catalog, docs } from '@ts-pf/docs'
import { openapi } from '@ts-pf/openapi'
import { contract } from './contract.js'

procedure.meta(docs({ description: 'Find a planet by id' }))
const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
  info: { title: 'Planet API', version: '1.0.0' },
})
```

Split-repo typed clients are an opt-in projection of that catalog too. The server repo prints a `.d.ts` once per release; the client repo checks in only that file. Do not put this in the default happy path:

```ts
import { writeFileSync } from 'node:fs'
import { catalog } from '@ts-pf/docs'
import { emit } from '@ts-pf/codegen'
import { contract } from './contract.js'

writeFileSync('contract.d.ts', emit(catalog(contract, { prefix: '/rpc' })))
```

```ts
// client/planets.ts — next to the emitted client/contract.d.ts
import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { Contract } from './contract.js'

const client = createClient<Contract>(new FetchLink({ url: '/rpc' }))
```

Message transports are opt-in too. Do not put this in the default happy path:

```ts
import { PortHandler } from '@ts-pf/message-server'
import { PortLink } from '@ts-pf/message-client'
import { createClient } from '@ts-pf/client'
import type { contract } from './contract.js'
import { app } from './server.js'

const { port1, port2 } = new MessageChannel()
// `bind` wants the same AppCtx as FetchHandler (the type comes from `app`).
// A port has no HTTP request: build one from the hello `meta`, or give
// message servers a slice with its own `$context`.
new PortHandler(app).bind(port1, {
  context: ({ meta }) => ({
    db,
    req: new Request('http://localhost/', { headers: meta as HeadersInit }),
  }),
})
const client = createClient<typeof contract>(new PortLink({ port: port2 }))
```

SWR is opt-in too. Do not put this in the default happy path:

```ts
import { createSwr } from '@ts-pf/swr'
import useSWR from 'swr'
import { client } from './client.js'

const swr = createSwr(client)
const { data } = useSWR(
  swr.planet.find.key({ input: { id: 1 } }),
  swr.planet.find.fetcher(),
)
```

mvc-kit is opt-in too. Do not put this in the default happy path:

```ts
// planets-resource.ts
import { bindClient } from '@ts-pf/mvc-kit'
import { Resource } from 'mvc-kit'
import { client } from './client.js'

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

Runnable apps in [`examples/`](examples/): [`hello`](examples/hello) (Fetch), [`codegen`](examples/codegen) (split-repo `emit` / `createClient<Contract>`), [`message`](examples/message) (MessagePort), [`stream`](examples/stream) (`StreamCodec`), [`plugins`](examples/plugins) (`CallPlugin` / `CallInterceptor`).

## Development

```sh
npm install
npm run lint && npm run check:skills && npm run check:deps && npm run type-check && npm test && npm run build && npm run check:exports
```

A public API / name / happy-path change updates `packages/<pkg>/skills/ts-pf-<pkg>/SKILL.md` in the same PR (`npm run check:skills`). Opt-in happy-path changes also update the matching snippet on `ts-pf-app`.

Releases use [Changesets](https://github.com/changesets/changesets) (`latest` on npm). See [`.changeset/README.md`](.changeset/README.md). A PR that changes a published `packages/*` package must include a changeset (`npx changeset`).
