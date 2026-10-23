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
// `contract` is the router from the ts-pf-contract skill (planet.list / find / create)
import { createImplementer, DedupePlugin } from '@ts-pf/server'
import { PFError } from '@ts-pf/protocol'

const impl = createImplementer(contract).$context<{ db: Db; user?: User }>()

const requireUser = impl.middleware(async ({ context, next }) => {
  const user = await auth(context)
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
```

`.use()` runs before input validation (`input: unknown`) and takes the same loose `MiddlewareFn` on `impl.use(mw)` and on a per-procedure `impl.planet.find.use(mw)`, so a middleware from `impl.middleware(fn)` fits both. `.useAfter()` runs after and is typed with that procedure's input and output, so it takes an inline function. Input checks default on, so `.useAfter()` then sees the parsed input. `validation: { input: false }` skips the input schema, including stream input items, and `.useAfter()` sees the raw value. Output checks, including stream output items, run only when `validation: { output: true }`. Unary output failure is `INTERNAL` with no issues. A bad stream output item is `VALIDATION` with issues. Parsed output (strip, defaults, transforms) is applied only when output checks run. Declared error `data` is always checked. `$context<C>()` is the context type source; middleware runtime-merges and does not infer added keys. Pass HTTP `Request` in `FetchHandler.handle(..., { context })`, not via `$context` alone. Name the implemented router `app`. Default `DedupePlugin` keys every unary call — pass `key` to restrict to reads.

`impl.router()` returns `ImplementedRouter<T, TCtx>`: `TCtx` is the `$context<C>()` type and each handler is an `ImplementedProcedure<typeof contract.planet.find, TCtx>` (type-only brands; the runtime object is unchanged). A missing key, an extra key, a handler built from another procedure under this key, or a slice built with a different `$context` is a type error that names the key. `FetchHandler`, the message handlers, `createLocalClient`, and `@ts-pf/astro` read `TCtx` from `app`, so `context` is checked against it. A tree not produced by `impl.router()` (a plain object of handlers) infers `unknown`; use `impl.router()`, or pick procedures into a second `impl.router()` call, to keep the check.

```ts no-check
createLocalClient(app, { context, validation: { output: true } }) // context: TCtx from app
runProcedure(proc, input, context, { validation: { input: false } })
```

Nest finished slice apps: `impl.router({ planet: planetApp, star: starApp })`. Each slice is `createImplementer(sliceContract).$context<AppCtx>().router({ ... })` with the same `AppCtx` (a slice that needs less than the root provides also nests; one that needs other keys does not). Root `.use(mw)` prepends onto nested procedures. Procedure `path` is the composed tree (`planet.find`). Pick an implemented procedure into a smaller server: `{ list: usersApp.list }`.

## API

- `createImplementer`, `createLocalClient`, `runProcedure`, `lookupProcedure`, `ProcedureValidation`
- `ImplementedRouter<T, TCtx>`, `ImplementedProcedure<TContract, TCtx>`, `RouterImpl<T, TCtx>`
- `applyPlugins`, `CallPlugin`, `CallInterceptor`, `DedupePlugin`
- `onStart` / `onSuccess` / `onError` / `onFinish`

## Pair with

- HTTP: `ts-pf-server-http` (`FetchHandler`)
- Message: `ts-pf-message-server`
- In-process: `createLocalClient(app, { context, plugins, interceptors, validation })`

## Don't

- `FetchHandler` or HTTP plugins here.
- Import `CallInterceptor` from `@ts-pf/client` (duplicate types).
- Attach interceptors or `validation` on `createImplementer` — they attach per caller (`createLocalClient` / handler `{ interceptors, validation }`).
- Default `DedupePlugin` on non-idempotent writes.
- `mergeRouters` — nest `impl.router({ planet: planetApp })`.
