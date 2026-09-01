---
name: ts-pf
description: Use when implementing, reviewing, refactoring, or extending the ts-pf library — @ts-pf/contract, protocol, server, or client; procedure/router builders; FetchHandler; createClient; schema adapters; middleware; or the JSON RPC protocol.
---

# ts-pf

Follow [`.agents/rules.md`](../../rules.md) for locks and public names. This skill is the architecture map and the "how to change it" guide.

Wire format: `packages/protocol/PROTOCOL.md`. DX overview: `README.md`.

## File map

```
packages/contract/src/
  builder.ts          procedure singleton, router()
  procedure.ts        ContractProcedure brand
  router.ts           nested-object brand + walk
  schema.ts           validateSchema dispatch
  adapters/           standard-schema, typebox
  infer.ts            InferContract*, ContractClient
packages/protocol/src/
  error.ts            PFError
  envelope.ts         RpcRequest/Response, RpcCodec, PFResultPromise
  codec.ts            JSONCodec
  path.ts             join/parse procedure path
packages/server/src/
  implement.ts        createImplementer proxy tree
  runtime.ts          runProcedure, lookupProcedure
  handler.ts          FetchHandler
  caller.ts           createLocalClient
  middleware.ts       MiddlewareFn types
  plugins.ts          HandlerPlugin
packages/client/src/
  client.ts           createClient proxy
  fetch-link.ts       FetchLink
  interceptors.ts
  as-result.ts        asResult
```

Do not merge handler + implementer. Do not put HTTP in contract.

## Happy path

```ts
import { procedure, router } from '@ts-pf/contract'
import { createImplementer, FetchHandler } from '@ts-pf/server'
import { createClient, FetchLink } from '@ts-pf/client'

export const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({ NOT_FOUND: { status: 404 } }),
  },
})

const impl = createImplementer(contract).$context<{ db: Db }>()
export const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input, context, errors }) => {
      const row = await context.db.planets.get(input.id)
      if (!row) throw errors.NOT_FOUND()
      return row
    }),
  },
})

const handler = new FetchHandler(app)
await handler.handle(request, { prefix: '/rpc', context: { db } })

const client = createClient<typeof contract>(new FetchLink({ url: '/rpc' }))
await client.planet.find({ id: 1 })
```

`$context<C>()` is the source of context types. Middleware runtime-merges; it does not infer added keys.

## Call pipeline

1. Decode JSON (`RpcCodec`)
2. `.use()` middleware — `input` is unvalidated
3. Input schema (422 `VALIDATION` on fail)
4. `.useAfter()` middleware — typed `input`
5. Handler
6. Output schema (500 `VALIDATION` — server bug)
7. Encode JSON

`createImplementer(contract).use(mw).router({...})` prepends `mw` onto every procedure in that tree, even if leaves were built from a builder without `mw`.

`createLocalClient(app, { context })` runs the same pipeline in-process (tests, SSR).

## Schemas

`procedure.input` / `.output` accept unconstrained `S`; types come from `InferSchemaOutput<S>`:

1. Zod 4-style `_zod.output`
2. TypeBox `static`
3. Standard Schema `~standard.types`

Runtime `validateSchema`: user `registerSchemaAdapter` (first `accept` match) → `'~standard' in schema` → TypeBox `Symbol.for('TypeBox.Kind')` → throw. TypeBox adapter dynamic-imports `@sinclair/typebox/value` (optional peer).

## How to add things

| Want | Do |
|---|---|
| Another validator | `registerSchemaAdapter` or `packages/contract/src/adapters/<vendor>.ts` |
| CORS / headers / limits | `HandlerPlugin` on `FetchHandler` — new file, not inside `handler.ts` |
| Extra wire types | new `RpcCodec` (or wrap `JSONCodec`). Do not special-case Date/Map in core. |
| OpenAPI, TanStack Query, Node HTTP, File/SSE | **new package** under `packages/`. Do not fold into contract/server/client. |
| Typed errors on a procedure | `.errors({ CODE: { status, message, data? } })` then `throw errors.CODE(data)` or `new PFError(...)` |

New packages: same `exports` (source for workspace, `publishConfig` → `dist`), `tsc -p tsconfig.build.json`, Vitest, Biome. Depend downward only (no client↔server).

## Anti-patterns

- Client importing `@ts-pf/server` (tests may, as a **devDependency**)
- HTTP routing or `Request` types in `contract`
- Schema validation in `protocol`
- Stacked `.input()` / `.output()` merge rules
- Serving REST and RPC from the same handler
- Middleware-index vs validation-index configuration (named `.use` / `.useAfter` only)
- A catch-all plugin manager

## Review checklist

- Names match the table in `.agents/rules.md`
- DAG still acyclic; client still schema-free of server
- Separation of concern for long term maintainability of all packages and their dependencies
- Procedure completeness: `impl.router()` rejects missing/extra keys (types + runtime)
- Errors: unknown throws → `INTERNAL` 500, no stack in JSON
- Protocol edits update `PROTOCOL.md`
- `pnpm lint && pnpm type-check && pnpm test && pnpm build`
