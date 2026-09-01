# ts-pf

TypeScript Procedure Factory — a contract-first, end-to-end type-safe RPC library.

oRPC-like DX without the dual-protocol platform. You write a contract, implement it on the server, and call it from a client that never imports server code.

Requires Node.js 18+.

## Packages

| Package | Role |
|---|---|
| [`@ts-pf/contract`](packages/contract) | `oc` builder, schema adapters, nested routers, infer types |
| [`@ts-pf/protocol`](packages/protocol) | Portable JSON RPC envelope, `PFError`, codec |
| [`@ts-pf/server`](packages/server) | `implement()`, middleware, Fetch `RPCHandler`, in-process client |
| [`@ts-pf/client`](packages/client) | `createClient()`, `FetchLink`, `safe()` |

Wire spec: [packages/protocol/PROTOCOL.md](packages/protocol/PROTOCOL.md).

## Contract

```ts
import { oc } from '@ts-pf/contract'
import { z } from 'zod'
import { Type } from '@sinclair/typebox'

export const contract = oc.router({
  planet: {
    list: oc.output(z.array(z.object({ id: z.number(), name: z.string() }))),
    find: oc
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({ NOT_FOUND: { status: 404 } }),
    create: oc
      .input(Type.Object({ name: Type.String() }))
      .output(Type.Object({ id: Type.Number(), name: Type.String() })),
  },
})
```

Schemas: any [Standard Schema](https://standardschema.dev/) library (Zod, Valibot, ArkType) or TypeBox. Register more with `registerSchemaAdapter`.

## Server

```ts
import { implement, RPCHandler } from '@ts-pf/server'
import { PFError } from '@ts-pf/protocol'
import { contract } from './contract'

const os = implement(contract).$context<{ db: Db; req: Request }>()

const requireUser = os.middleware(async ({ context, next }) => {
  const user = await auth(context.req)
  if (!user) throw new PFError({ code: 'UNAUTHORIZED', status: 401 })
  return next({ context: { user } })
})

export const router = os.use(requireUser).router({
  planet: {
    list: os.planet.list.handler(async ({ context }) => context.db.planets.all()),
    find: os.planet.find.handler(async ({ input, context, errors }) => {
      const row = await context.db.planets.get(input.id)
      if (!row) throw errors.NOT_FOUND()
      return row
    }),
    create: os.planet.create.handler(async ({ input, context }) =>
      context.db.planets.create(input),
    ),
  },
})

const handler = new RPCHandler(router)

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
import { createClient, FetchLink, safe } from '@ts-pf/client'
import type { ContractClient } from '@ts-pf/contract'
import type { contract } from './contract'

export const client: ContractClient<typeof contract> = createClient(
  new FetchLink({ url: '/rpc' }),
)

const planet = await client.planet.find({ id: 1 })
const listed = await client.planet.list()

const result = await safe(client.planet.find({ id: 1 }))
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
