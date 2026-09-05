---
name: ts-pf-server
description: Use when implementing a ts-pf contract with createImplementer, middleware, runProcedure, createLocalClient, or server DedupePlugin / CallInterceptor. Triggers: @ts-pf/server, createImplementer, .use(), .useAfter(), createLocalClient, applyPlugins.
---

# @ts-pf/server

Implementer, middleware, `runProcedure`. No `Request` / `Response`.

Install: `npm i @ts-pf/server` (needs `@ts-pf/contract` + `@ts-pf/protocol`)

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { createImplementer, DedupePlugin } from '@ts-pf/server'
import { PFError } from '@ts-pf/protocol'

const impl = createImplementer(contract).$context<{ db: Db }>()

const requireUser = impl.middleware(async ({ context, next }) => {
  const user = await auth(context)
  if (!user) throw new PFError({ code: 'UNAUTHORIZED', status: 401 })
  return next({ context: { user } })
})

export const app = impl.use(requireUser).router({
  planet: {
    find: impl.planet.find.handler(async ({ input, context, errors }) => {
      const row = await context.db.planets.get(input.id)
      if (!row) throw errors.NOT_FOUND({ id: input.id })
      return row
    }),
  },
})
```

`.use()` runs before input validation (`input: unknown`). `.useAfter()` runs after (typed input). `$context<C>()` is the context type source; middleware runtime-merges and does not infer added keys. Pass HTTP `Request` in `FetchHandler.handle(..., { context })`, not via `$context` alone. Name the implemented router `app`. Default `DedupePlugin` keys every unary call — pass `key` to restrict to reads.

## API

- `createImplementer`, `createLocalClient`, `runProcedure`, `lookupProcedure`
- `applyPlugins`, `CallPlugin`, `CallInterceptor`, `DedupePlugin`
- `onStart` / `onSuccess` / `onError` / `onFinish`

## Pair with

- HTTP: `ts-pf-server-http` (`FetchHandler`)
- Message: `ts-pf-message-server`
- In-process: `createLocalClient(app, { context, plugins, interceptors })`

## Don't

- `FetchHandler` or HTTP plugins here.
- Import `CallInterceptor` from `@ts-pf/client` (duplicate types).
- Attach interceptors on `createImplementer` — they attach per caller (`createLocalClient` / handler `{ interceptors }`).
- Default `DedupePlugin` on non-idempotent writes.
