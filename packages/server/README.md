# @ts-pf/server

`createImplementer()`, middleware, `mapStreamErrors`, `runProcedure`, `lookupProcedure`, `createLocalClient()`, and server call interceptors / `DedupePlugin` for [ts-pf](https://github.com/crobinson42/ts-pf#readme). Implements a contract from `@ts-pf/contract`. No `Request` / `Response` — HTTP is `@ts-pf/server-http`.

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

## Keys middleware adds

Middleware does not narrow the context type yet: `next({ context: { user } })` merges at runtime, but handlers still see `$context<AppCtx>()`, where `user` is optional. Declare those keys optional, let one `.use()` middleware set them or throw, and narrow in the handler with a helper that checks the key (not with a cast at each call site). The context factory then never needs placeholder keys:

```ts
import { PFError } from '@ts-pf/protocol'
import { createImplementer } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { contract } from './contract.js'

type AppCtx = { db: Db; req: Request; user?: User }

const impl = createImplementer(contract).$context<AppCtx>()

const requireUser = impl.middleware(async ({ context, next }) => {
  const user = await auth(context.req)
  if (!user) throw new PFError({ code: 'UNAUTHORIZED', status: 401 })
  return next({ context: { user } })
})

/** `context` with `user` set by `requireUser`; throws if it is missing. */
function signedIn(context: AppCtx): AppCtx & { user: User } {
  if (!context.user) throw new PFError({ code: 'UNAUTHORIZED', status: 401 })
  return context as AppCtx & { user: User }
}

export const app = impl.router({
  planet: {
    list: impl.planet.list.handler(async ({ context }) => context.db.planets.all()),
    find: impl.planet.find.handler(async ({ input, context, errors }) => {
      const row = await context.db.planets.get(input.id)
      if (!row) throw errors.NOT_FOUND({ id: input.id })
      return row
    }),
    create: impl.planet.create.use(requireUser).handler(async ({ input, context }) => {
      const { db, user } = signedIn(context)
      console.log(`${user.id} creates ${input.name}`)
      return db.planets.create(input)
    }),
  },
})

// No `user: undefined` placeholder: the key is optional.
const handler = new FetchHandler(app)
await handler.handle(request, { prefix: '/rpc', context: (req) => ({ db, req }) })
```

## Mapping domain errors

A `.use()` middleware that wraps `await next()` in `try` / `catch` maps errors thrown before a procedure returns. A stream procedure returns its `AsyncIterable` first and throws while it is iterated, after that `catch` has finished, so a domain error thrown mid-stream reaches a remote client as `INTERNAL` (an in-process caller gets the raw error). `mapStreamErrors(value, fn)` wraps an async iterable so a throw from its `next()` is replaced by `fn(error)`; any other value is returned unchanged, so one middleware covers unary and stream procedures:

```ts
import { isPFError, PFError } from '@ts-pf/protocol'
import { createImplementer, mapStreamErrors } from '@ts-pf/server'
import { contract } from './contract.js'

class QuotaExceeded extends Error {}

// Returns the error to throw. Return PFErrors unchanged: input VALIDATION,
// stream item VALIDATION, and errors.CODE() throws must reach the client as they are.
// Declare RATE_LIMITED on .errors() so clients can narrow on it.
function mapError(error: unknown): unknown {
  if (isPFError(error)) return error
  if (error instanceof QuotaExceeded) {
    return new PFError({ code: 'RATE_LIMITED', status: 429 })
  }
  return error
}

const impl = createImplementer(contract).$context<{ db: Db }>()

const mapErrors = impl.middleware(async ({ next }) => {
  try {
    return mapStreamErrors(await next(), mapError)
  } catch (error) {
    throw mapError(error)
  }
})

// First, so it sees every throw from the middleware and handler below it.
export const root = impl.use(mapErrors)
```

`fn` sees every value the iterable throws. The mapped error is still checked against the contract like any other throw (a declared code's `data` is validated; data that fails is sent as `INTERNAL`), because middleware runs inside the procedure. Only `data` is checked: the declared `status` and `message` are not applied to an error you build, so set them on the `PFError` yourself. `return()` (a client that stops reading) reaches the source iterator, including before the first item. Server call interceptors wrap the whole procedure and see its errors after that check, so an error mapped there skips the `data` validation: map in middleware.

## Middleware and handler notes

- Call `next()` at most once in a `.use()` / `.useAfter()` middleware. One call keeps one input and context: a second `next()` runs the rest of the chain on the input the first run already parsed and the context inner middleware already added, and concurrent calls race. For retries or hedging, use a `CallInterceptor`; its `next()` may be called more than once, and each call gets a fresh execution.
- The handler's `signal` is optional. `FetchHandler` (the request's signal) and the message handlers always pass one; `createLocalClient` without `{ signal }`, a direct `runProcedure`, and `@ts-pf/mcp` without a host signal may not. Guard it: `signal?.throwIfAborted()`, or `signal ?? AbortSignal.timeout(5_000)` when you pass it on.

## API

- `createImplementer`, `createLocalClient`, `runProcedure`, `lookupProcedure`, `ProcedureValidation`
- `validationError(issues)` — the `VALIDATION` `PFError` the input check throws, for handlers that validate themselves
- `applyPlugins`, `CallPlugin`, `CallInterceptor`, `DedupePlugin`
- `mapStreamErrors`
- `onStart` / `onSuccess` / `onError` / `onFinish`

## Agent skills

This package ships [`ts-pf-server`](https://github.com/crobinson42/ts-pf/blob/main/packages/server/skills/ts-pf-server/SKILL.md). Sync with `npx skills experimental_sync -y`.
