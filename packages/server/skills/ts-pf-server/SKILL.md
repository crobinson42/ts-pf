---
name: ts-pf-server
description: "Use when implementing a ts-pf contract with createImplementer, middleware, runProcedure, createLocalClient, or server DedupePlugin / CallInterceptor. Triggers: @ts-pf/server, createImplementer, .use(), .useAfter(), createLocalClient, applyPlugins, validationError, mapStreamErrors."
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
```

`.use()` runs before input validation (`input: unknown`) and takes the same `MiddlewareFn` (input `unknown`) on `impl.use(mw)` and on a per-procedure `impl.planet.find.use(mw)`, so a middleware from `impl.middleware(fn)` fits both. `.useAfter()` runs after and is typed with that procedure's parsed input (the input schema's output type) and output, so it takes an inline function. Input checks default on, so `.useAfter()` then sees the parsed input. `validation: { input: false }` skips the input schema, including stream input items, and `.useAfter()` and the handler see the raw value even though `input` is still typed as parsed (contract-only narrowing — zod `.omit()`, defaults, transforms — is not applied); validate in the handler and `throw validationError(toValidationIssues(result.issues))` (`toValidationIssues` from `@ts-pf/contract`) to answer in the built-in `VALIDATION` shape. Output checks, including stream output items, run only when `validation: { output: true }`. Unary output failure is `INTERNAL` with no issues. A bad stream output item is `VALIDATION` with issues. Parsed output (strip, defaults, transforms) is applied only when output checks run. Declared error `data` is always checked. A hand-built `new PFError({ code })` for a declared code gets the declared `status` when it has none, exactly like `errors.CODE()`, and keeps its `cause` (`message` is not filled). `$context<C>()` is the context adapters supply; middleware `next({ context })` adds typed keys for later middleware and the handler (see below). Pass HTTP `Request` in `FetchHandler.handle(..., { context })`, not via `$context` alone. Name the implemented router `app`. Default `DedupePlugin` keys every unary call — pass `key` to restrict to reads.

`impl.router()` returns `ImplementedRouter<T, TCtx>`: `TCtx` is the `$context<C>()` type and each handler is an `ImplementedProcedure<typeof contract.planet.find, TCtx>` (type-only brands; the runtime object is unchanged). A missing key, an extra key, a handler built from another procedure under this key, or a slice built with a different `$context` is a type error that names the key. `FetchHandler`, the message handlers, `createLocalClient`, and `@ts-pf/astro` read `TCtx` from `app`, so `context` is checked against it. A tree not produced by `impl.router()` (a plain object of handlers) infers `unknown`; use `impl.router()`, or pick procedures into a second `impl.router()` call, to keep the check.

```ts no-check
createLocalClient(app, { context, validation: { output: true } }) // context: TCtx from app
runProcedure(proc, input, context, { validation: { input: false } })
```

Nest finished slice apps: `impl.router({ planet: planetApp, star: starApp })`. Each slice is `createImplementer(sliceContract).$context<AppCtx>().router({ ... })` with the same `AppCtx` (a slice that needs less than the root provides also nests; one that needs other keys does not). Root `.use(mw)` prepends onto nested procedures. Procedure `path` is the composed tree (`planet.find`). Pick an implemented procedure into a smaller server: `{ list: usersApp.list }`.

### Keys middleware adds

`next({ context: { user } })` adds `user` to the context type of later middleware and the handler. `$context<AppCtx>()` is only what adapters supply (and the router brand); never declare middleware-added keys there as optional placeholders:

```ts
import { PFError } from '@ts-pf/protocol'
import { createImplementer } from '@ts-pf/server'

type AppCtx = { db: Db; req: Request }
const impl = createImplementer(contract).$context<AppCtx>()

const requireUser = impl.middleware(async ({ context, next }) => {
  const user = await auth(context.req)
  if (!user) throw new PFError({ code: 'UNAUTHORIZED', status: 401 })
  return next({ context: { user } }) // merges; typed downstream
})

const authed = impl.use(requireUser)
const create = authed.planet.create.handler(async ({ input, context }) => {
  console.log(context.user.id) // User
  return context.db.planets.create(input)
})
// context factory: (req) => ({ db, req })
```

Build the handler from the level that has the middleware (`authed.planet.create.handler()` or `impl.planet.create.use(requireUser).handler()`); handlers from `impl` and `authed` mix in one `impl.router()` (same `AppCtx` brand), and `authed.router()` works too; the middleware runs once per call either way. Return `next()`'s result: added keys are read from its type (`MiddlewareResult`); to change the value spread it (`{ ...result, extra }`), since a brand-new value drops them. A key added on only some paths stays optional. An added key may narrow an existing key (`user?: User` → `User`), not change its type. A shared middleware outside an implementer: `MiddlewareFn<AppCtx, { user: User }>` (`MiddlewareFn<TCtx, TAdded, TInput, TOutput>`).

### Mapping domain errors

`try { await next() } catch` misses throws during stream iteration (the iterable is returned first). Use one mapping middleware, first in the chain; `mapStreamErrors(value, fn)` wraps an async iterable (a throw from the iterator's `next()` becomes `fn(error)`; `return()` reaches the source, even before the first item) and returns anything else unchanged:

```ts
import { isPFError } from '@ts-pf/protocol'
import { createImplementer, mapStreamErrors } from '@ts-pf/server'

declare function toPFError(error: unknown): unknown // your domain mapping
const mapError = (error: unknown) => (isPFError(error) ? error : toPFError(error))

const impl = createImplementer(contract).$context<{ db: Db }>()
const root = impl.use(async ({ next }) => {
  try {
    return mapStreamErrors(await next(), mapError)
  } catch (error) {
    throw mapError(error)
  }
})
```

`fn` returns the error to throw and sees every thrown value: return `PFError`s unchanged so input / stream-item `VALIDATION` and `errors.CODE()` throws survive. Mapped errors still get the declared-error `data` check (invalid → `INTERNAL`) and the declared `status` when they have none, because middleware runs inside the procedure; set the `message` on the `PFError` you return. Not in a call interceptor: interceptors see errors after that check.

Domain error catalog (the domain layer owns its codes): code → message, a status map where `null` = not exposed (sent as `INTERNAL`), `clientErrors` derived from the exposed codes for `.errors(clientErrors)`, and a `mapDomainError` that needs only `@ts-pf/protocol`:

```ts
import { PFError } from '@ts-pf/protocol'
import type { MiddlewareFn } from '@ts-pf/server'
import { mapStreamErrors } from '@ts-pf/server'

const messages = { BOOK_NOT_FOUND: 'Book not found', LEDGER_MISMATCH: 'Ledger mismatch' } as const
type DomainCode = keyof typeof messages
class DomainError extends Error {
  readonly code: DomainCode
  constructor(code: DomainCode) {
    super(messages[code])
    this.code = code
  }
}
const status = { BOOK_NOT_FOUND: 404, LEDGER_MISMATCH: null } as const satisfies Record<DomainCode, number | null>
export const clientErrors = { BOOK_NOT_FOUND: { status: status.BOOK_NOT_FOUND, message: messages.BOOK_NOT_FOUND } } // derive from `status` in real code

function mapDomainError(error: unknown): unknown {
  if (!(error instanceof DomainError)) return error // PFErrors and unknown throws as is
  if (status[error.code] === null) return new PFError({ code: 'INTERNAL', message: 'Internal server error', cause: error })
  return new PFError({ code: error.code, message: error.message, cause: error }) // status filled from the declared entry
}

// MiddlewareFn is type-only; mapStreamErrors is a runtime @ts-pf/server import (peer dep in a shared package).
export const mapDomainErrors: MiddlewareFn = async ({ next }) => {
  try {
    return mapStreamErrors(await next(), mapDomainError)
  } catch (error) {
    throw mapDomainError(error)
  }
}
// impl.use(mapDomainErrors) — first in the chain
```

A code the procedure does not declare is sent without the declared status (HTTP 400) and is not in the client type. `.errors(clientErrors)` on every procedure is simple but loses per-procedure client error types: a shared base map plus per-area spreads is a good middle ground, `.errors({ ...baseErrors, ...areaErrors })` (a second `.errors()` call replaces the map). Full recipe: `@ts-pf/server` README "A domain error catalog"; trade-off: [Evolving a contract](https://github.com/crobinson42/ts-pf/blob/main/docs/evolution.md#error-maps-shared-or-per-procedure).

### Middleware and handler rules

- `next()` at most once per `.use()` / `.useAfter()` call. Execution state (`input`, `context`) is shared: a second call re-runs inner middleware on already-parsed input with the context inner middleware added, and concurrent calls race. Retries / hedging are a `CallInterceptor` (its `next()` may run more than once; each gets a fresh execution).
- Handler `signal` is optional: `FetchHandler` and message handlers always pass one; `createLocalClient` without `{ signal }`, direct `runProcedure`, and `@ts-pf/mcp` without a host signal may not. Guard: `signal?.throwIfAborted()` / `signal ?? AbortSignal.timeout(ms)`.

## API

- `createImplementer`, `createLocalClient`, `runProcedure`, `lookupProcedure`, `ProcedureValidation`
- `validationError(issues)` — the `VALIDATION` `PFError` the input check throws (`Validation failed`, `data: { issues }`), for handlers that validate themselves
- `ImplementedRouter<T, TCtx>`, `ImplementedProcedure<TContract, TCtx>`, `RouterImpl<T, TCtx>`
- `MiddlewareFn<TCtx, TAdded, TInput, TOutput>`, `NextFn`, `MiddlewareResult`, `MergeContext`, `ErrorFactory`
- `applyPlugins`, `CallPlugin`, `CallInterceptor`, `DedupePlugin`
- `mapStreamErrors`
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
- Call middleware `next()` twice (retry in a `CallInterceptor`).
- Map domain errors with only a `catch` around `await next()` — it misses mid-stream throws; add `mapStreamErrors`.
- Map domain errors in a call interceptor — it skips the declared `data` check.
- Cast `context as AppCtx & { user: User }` at call sites — narrow with a checking helper.
