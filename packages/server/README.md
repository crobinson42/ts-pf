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

// What the adapter supplies; middleware adds `user` (see "Keys middleware adds").
export type AppCtx = { db: Db; req: Request }

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

A middleware that passes keys to `next({ context })` adds them to the context type of every middleware and handler after it. `$context<AppCtx>()` stays what the adapter supplies; the middleware supplies the rest:

```ts
import { PFError } from '@ts-pf/protocol'
import { createImplementer } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { contract } from './contract.js'

type AppCtx = { db: Db; req: Request }

const impl = createImplementer(contract).$context<AppCtx>()

const requireUser = impl.middleware(async ({ context, next }) => {
  const user = await auth(context.req)
  if (!user) throw new PFError({ code: 'UNAUTHORIZED', status: 401 })
  return next({ context: { user } })
})

const authed = impl.use(requireUser)

export const app = impl.router({
  planet: {
    list: impl.planet.list.handler(async ({ context }) => context.db.planets.all()),
    find: impl.planet.find.handler(async ({ input, context, errors }) => {
      const row = await context.db.planets.get(input.id)
      if (!row) throw errors.NOT_FOUND({ id: input.id })
      return row
    }),
    create: authed.planet.create.handler(async ({ input, context }) => {
      console.log(`${context.user.id} creates ${input.name}`) // user: User
      return context.db.planets.create(input)
    }),
  },
})

// The context factory supplies AppCtx only; requireUser adds `user`.
const handler = new FetchHandler(app)
await handler.handle(request, { prefix: '/rpc', context: (req) => ({ db, req }) })
```

- The type follows the builder. Build a handler from the level that has the middleware: `authed.planet.create.handler()`, or `impl.planet.create.use(requireUser).handler()`. Handlers from `impl` and from `authed` mix in one `impl.router()` (both are branded with `AppCtx`), and `authed.router({ ... })` works too: either way the middleware runs once per call.
- Return what `next()` returns: the added keys are read from the middleware's return type (`MiddlewareResult`). To change the value, spread the result (`{ ...result, extra }`); a brand-new value drops the added keys. A key added on only some paths stays optional.
- An added key may narrow a key `AppCtx` already has (`user?: User` → `user: User`), not change its type.
- Adapters and `createLocalClient` still take `AppCtx`: narrowing never changes what callers supply.
- A shared middleware written outside an implementer declares what it adds: `MiddlewareFn<AppCtx, { user: User }>`.

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

`fn` sees every value the iterable throws. The mapped error is still checked against the contract like any other throw (a declared code's `data` is validated; data that fails is sent as `INTERNAL`), because middleware runs inside the procedure. A declared code without its own `status` also gets the declared one; the declared `message` is not applied, so set it on the `PFError` yourself. `return()` (a client that stops reading) reaches the source iterator, including before the first item. Server call interceptors wrap the whole procedure and see its errors after that check, so an error mapped there skips the `data` validation: map in middleware.

### A domain error catalog

When the domain layer owns its errors (and may be shared by more than one server), keep one catalog there and derive the contract's codes from it. Every domain code has a message and a status; `null` means "not exposed to clients", and the mapping sends it as `INTERNAL`. This file needs only `@ts-pf/protocol`:

```ts
// domain-errors.ts — owned by the domain layer
import { PFError } from '@ts-pf/protocol'

/** Every error the domain raises, with its message. */
const domainErrors = {
  BOOK_NOT_FOUND: 'Book not found',
  LOAN_LIMIT_REACHED: 'Loan limit reached',
  LEDGER_MISMATCH: 'Ledger totals do not match',
} as const

export type DomainCode = keyof typeof domainErrors

export class DomainError extends Error {
  readonly code: DomainCode
  constructor(code: DomainCode, options?: ErrorOptions) {
    super(domainErrors[code], options)
    this.code = code
  }
}

/** HTTP status per code; `null` = not exposed to clients (sent as INTERNAL). */
const domainStatus = {
  BOOK_NOT_FOUND: 404,
  LOAN_LIMIT_REACHED: 409,
  LEDGER_MISMATCH: null,
} as const satisfies Record<DomainCode, number | null>

type ExposedCode = {
  [K in DomainCode]: (typeof domainStatus)[K] extends number ? K : never
}[DomainCode]

/** The exposed codes as an error map for `procedure.errors()`. */
export const clientErrors = Object.fromEntries(
  Object.entries(domainStatus).flatMap(([code, status]) =>
    status === null ? [] : [[code, { status, message: domainErrors[code as DomainCode] }]],
  ),
) as { [K in ExposedCode]: { status: (typeof domainStatus)[K]; message: string } }

/** A DomainError becomes a PFError; anything else (PFErrors included) is returned as is. */
export function mapDomainError(error: unknown): unknown {
  if (!(error instanceof DomainError)) return error
  if (domainStatus[error.code] === null) {
    return new PFError({ code: 'INTERNAL', message: 'Internal server error', cause: error })
  }
  return new PFError({ code: error.code, message: error.message, cause: error })
}
```

The contract declares the exposed codes, and one mapping middleware runs first:

```ts
// library-contract.ts
import { procedure, router } from '@ts-pf/contract'
import { z } from 'zod'
import { clientErrors } from './domain-errors.js'

export const contract = router({
  loan: {
    create: procedure
      .input(z.object({ bookId: z.string() }))
      .output(z.object({ loanId: z.string() }))
      .errors(clientErrors),
  },
})
```

```ts
// map-domain-errors.ts — server side: mapStreamErrors is a runtime import from @ts-pf/server
import { type MiddlewareFn, mapStreamErrors } from '@ts-pf/server'
import { mapDomainError } from './domain-errors.js'

export const mapDomainErrors: MiddlewareFn = async ({ next }) => {
  try {
    return mapStreamErrors(await next(), mapDomainError)
  } catch (error) {
    throw mapDomainError(error)
  }
}
```

```ts
// library-server.ts
import { createImplementer } from '@ts-pf/server'
import { DomainError } from './domain-errors.js'
import { contract } from './library-contract.js'
import { mapDomainErrors } from './map-domain-errors.js'

const impl = createImplementer(contract)

export const app = impl.use(mapDomainErrors).router({
  loan: {
    create: impl.loan.create.handler(async ({ input }) => {
      if (input.bookId === '') throw new DomainError('BOOK_NOT_FOUND')
      return { loanId: 'loan-1' }
    }),
  },
})
```

- The mapped `PFError` sets no `status`: `runProcedure` fills it from the declared entry (404 for `BOOK_NOT_FOUND`) and keeps `cause`, so your logger still sees the domain error. A code the procedure does not declare is sent with HTTP 400 and is outside the client's type; pass `status` too if a procedure can throw codes it does not declare.
- Unknown throws pass through unchanged and become `INTERNAL`, as does a `null`-status code. Both are logged by the `FetchHandler` default (`isUnexpectedError`).
- A code that carries data: give `DomainError` a `data` field, pass it to the `PFError`, and add the schema to that code's entry on the contract (`{ ...clientErrors.BOOK_NOT_FOUND, data: schema }`), where it is checked like any declared `data`.
- `MiddlewareFn` is a type-only import, so the middleware needs no implementer and fits `impl.use()` and a per-procedure `.use()` on any server. `domain-errors.ts` does not import `@ts-pf/server`; `map-domain-errors.ts` does (for `mapStreamErrors`), so a shared package that ships it lists `@ts-pf/server` as a peer dependency.
- `.errors(clientErrors)` on every procedure is the simple choice, and it gives up per-procedure client error types. See [Error maps: shared or per procedure](https://github.com/crobinson42/ts-pf/blob/main/docs/evolution.md#error-maps-shared-or-per-procedure) for the trade-off and a base-set-plus-area pattern.

## Middleware and handler notes

- Call `next()` at most once in a `.use()` / `.useAfter()` middleware. One call keeps one input and context: a second `next()` runs the rest of the chain on the input the first run already parsed and the context inner middleware already added, and concurrent calls race. For retries or hedging, use a `CallInterceptor`; its `next()` may be called more than once, and each call gets a fresh execution.
- The handler's `signal` is optional. `FetchHandler` (the request's signal) and the message handlers always pass one; `createLocalClient` without `{ signal }`, a direct `runProcedure`, and `@ts-pf/mcp` without a host signal may not. Guard it: `signal?.throwIfAborted()`, or `signal ?? AbortSignal.timeout(5_000)` when you pass it on.

## API

- `createImplementer`, `createLocalClient`, `runProcedure`, `lookupProcedure`, `ProcedureValidation`
- `validationError(issues)` — the `VALIDATION` `PFError` the input check throws, for handlers that validate themselves
- `MiddlewareFn<TCtx, TAdded, TInput, TOutput>`, `NextFn`, `MiddlewareResult`, `MergeContext`, `ErrorFactory`
- `applyPlugins`, `CallPlugin`, `CallInterceptor`, `DedupePlugin`
- `mapStreamErrors`
- `onStart` / `onSuccess` / `onError` / `onFinish`

## Agent skills

This package ships [`ts-pf-server`](https://github.com/crobinson42/ts-pf/blob/main/packages/server/skills/ts-pf-server/SKILL.md). Sync with `npx skills experimental_sync -y`.
