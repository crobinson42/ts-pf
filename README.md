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
| [`@ts-pf/client`](packages/client) | `createClient()`, `FetchLink`, `asResult()` |

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
      .errors({ NOT_FOUND: { status: 404 } }),
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
      if (!row) throw errors.NOT_FOUND()
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

const result = await asResult(client.planet.find({ id: 1 }))
if (!result.ok) {
  result.error.code
}
```

## Why not oRPC?

oRPC is a dual RPC + OpenAPI platform with many adapters, serializers, and integrations. ts-pf keeps the contract-first DX and typed middleware, and leaves OpenAPI, extra adapters, and TanStack Query to later packages.

## Development

```sh
pnpm install
pnpm test
pnpm type-check
pnpm build
```
