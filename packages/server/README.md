# @ts-pf/server

`createImplementer()`, middleware, `runProcedure`, `lookupProcedure`, `createLocalClient()`, and server call interceptors / `DedupePlugin` for [ts-pf](https://github.com/crobinson42/ts-pf#readme). Implements a contract from `@ts-pf/contract`. No `Request` / `Response` — HTTP is `@ts-pf/server-http`.

## Install

```sh
npm i @ts-pf/contract @ts-pf/server @ts-pf/server-http @ts-pf/client @ts-pf/client-http zod
```

## Implement

```ts
// server.ts — `contract` is the router from @ts-pf/contract (planet.list / find / create)
import { createImplementer, createLocalClient } from '@ts-pf/server'
import { PFError } from '@ts-pf/protocol'
import { contract } from './contract.js'

// Declare every key middleware adds (`user`) here; `next({ context })` takes a
// Partial of this type and does not infer new keys.
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
      if (!row) throw errors.NOT_FOUND({ id: input.id }) // declared on the contract
      return row
    }),
    create: impl.planet.create.handler(async ({ input, context }) =>
      context.db.planets.create(input),
    ),
  },
})

// In-process caller (tests, SSR): same middleware, validation, and typed errors.
const local = createLocalClient(app, { context: { db, req: new Request('http://local/') } })
await local.planet.find({ id: 1 })
```

`Db`, `User`, `db`, and `auth()` are your app's. `.use()` runs before input validation (`input: unknown`); `.useAfter()` runs after it. Input checks default on; output checks run only with `validation: { output: true }`. Name the implemented router `app`.

A declared code gets its declared `status` whether you throw `errors.NOT_FOUND(...)` or a hand-built `new PFError({ code: 'NOT_FOUND', data, cause })`: `runProcedure` fills an unset `status` on an error thrown from middleware or the handler from the contract's `.errors()` entry and keeps `cause` (it never fills `message`).

`validation: { input: false }` hands the handler the raw value, although its `input` type still says parsed: contract-only narrowing (zod `.omit()`, defaults, transforms) is not applied. A handler that validates on its own reports failures in the built-in shape with `validationError` (this package) and `toValidationIssues` from `@ts-pf/contract`:

```ts
import { toValidationIssues } from '@ts-pf/contract'
import { createImplementer, validationError } from '@ts-pf/server'
import { z } from 'zod'

const createInput = z.object({ name: z.string().min(1) })

const impl = createImplementer(contract)
const create = impl.planet.create.handler(async ({ input }) => {
  const result = await createInput['~standard'].validate(input)
  if (result.issues) throw validationError(toValidationIssues(result.issues))
  return { id: 1, name: result.value.name }
})
```

Serve it over HTTP with `FetchHandler` from `@ts-pf/server-http` — `new FetchHandler(app).handle(request, { prefix: '/rpc', context: (req) => ({ db, req }) })` — on Workers, Bun, Deno, Node, Hono, or Next.js: see [Serving FetchHandler](https://github.com/crobinson42/ts-pf#serving-fetchhandler). Message transports are `@ts-pf/message-server`.

Server `DedupePlugin` keys every unary call by default, writes included; pass `key` to restrict it to reads.

## API

- `createImplementer`, `createLocalClient`, `runProcedure`, `lookupProcedure`, `ProcedureValidation`
- `validationError(issues)` — the `VALIDATION` `PFError` the input check throws, for handlers that validate themselves
- `applyPlugins`, `CallPlugin`, `CallInterceptor`, `DedupePlugin`
- `onStart` / `onSuccess` / `onError` / `onFinish`

## Agent skills

This package ships [`ts-pf-server`](https://github.com/crobinson42/ts-pf/blob/main/packages/server/skills/ts-pf-server/SKILL.md). Sync with `npx skills experimental_sync -y`.
