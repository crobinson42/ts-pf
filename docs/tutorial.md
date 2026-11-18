# Tutorial

Build a small planet API over the Fetch adapter. The runnable form of this walkthrough is [`examples/hello`](../examples/hello). The snippets match the root [README](../README.md) happy path and are type-checked by `npm run check:snippets`.

## Install

```sh
npm install @ts-pf/contract @ts-pf/server @ts-pf/server-http @ts-pf/client @ts-pf/client-http zod
```

Schemas are any [Standard Schema](https://standardschema.dev/) library (Zod, Valibot, ArkType) or TypeBox; `zod` here is one choice. Node.js 22+. TypeScript needs `"moduleResolution": "node16"`, `"nodenext"`, or `"bundler"`.

## 1. Define a contract

The contract is the one file both sides import. No HTTP, no handlers.

```ts
// contract.ts
import { procedure, router } from '@ts-pf/contract'
import { z } from 'zod'

export const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({ NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) } }),
  },
})
```

`.input()` once, `.output()` optional (`unknown` if omitted), `.errors()` declares typed failures the handler throws and the client narrows on.

## 2. Implement it

`createImplementer(contract)` mirrors the contract keys. `impl.router()` is a type error if a procedure is missing, extra, or under the wrong key. Name the implemented router `app`.

```ts
// server.ts
import { createImplementer } from '@ts-pf/server'
import { contract } from './contract.js'

export type AppCtx = { db: Db }

const impl = createImplementer(contract).$context<AppCtx>()
export const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input, context, errors }) => {
      const row = await context.db.planets.get(input.id)
      if (!row) throw errors.NOT_FOUND({ id: input.id })
      return row
    }),
  },
})
```

`$context<C>()` is the only source of context types. Declare optional keys middleware will add up front; `.use()` does not narrow the type.

## 3. Serve it

`FetchHandler` speaks Fetch `Request` / `Response` only. It infers `AppCtx` from `app`.

```ts
// rpc.ts
import { FetchHandler } from '@ts-pf/server-http'
import { app } from './server.js'

export const handler = new FetchHandler(app)

export async function rpc(request: Request): Promise<Response> {
  const result = await handler.handle(request, {
    prefix: '/rpc',
    context: { db },
  })
  if (!result.matched) return new Response('Not Found', { status: 404 })
  return result.response
}
```

Any runtime that hands you a `Request` can host that function. ts-pf ships no Node `IncomingMessage` adapter. Serving notes and framework snippets: [Serving FetchHandler](../README.md#serving-fetchhandler).

## 4. Call it

The client imports the contract **type**, never `@ts-pf/server`.

```ts
import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import { contract } from './contract.js'

const client = createClient<typeof contract>(new FetchLink({ url: '/rpc' }))
await client.planet.find({ id: 1 })
```

`asResult(client.planet.find({ id: 1 }))` turns a thrown `PFError` into `{ ok, error }`; `error.code === 'NOT_FOUND'` narrows `error.data`.

## What next

- [Getting started](../README.md) — install, middleware, codecs, plugins, and every package.
- [Concepts](concepts.md) — contract vs implementer vs app, context, links, interceptors, validation defaults.
- [Errors](errors.md) — `PFError`, declared errors, `asResult`, `status` per transport.
- [Testing](testing.md) — in-process `fetch` stub or `createLocalClient`.
- [@ts-pf/contract](../packages/contract) and the other package READMEs — each one is that package's API page.
- [`examples/`](../examples/) — smoke-tested apps; `hello` can also listen with `npm run dev`.
