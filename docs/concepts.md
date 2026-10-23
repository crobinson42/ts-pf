# Concepts

The mental model behind ts-pf, in the order you meet it: contract, implementer, app, context, middleware, links, codecs, interceptors, validation. The root [README](../README.md) shows the happy path; this page explains why the pieces are shaped the way they are. Package-level cheat sheets live in each package's `skills/` folder and the wire format in [`PROTOCOL.md`](../packages/protocol/PROTOCOL.md).

## Contract, implementer, app

A **contract** is a plain object of `procedure` builders inside `router()`. It holds schemas and declared error codes and nothing else: no handlers, no HTTP, no runtime. Both the server and the client import it (the client imports it as a type only).

An **implementer** is `createImplementer(contract)`. It mirrors the contract's keys and hands you a `handler()` builder for each procedure, typed from that procedure's input, output, and errors. `impl.router({ ... })` checks that every contract key has exactly one handler and produces the **app**: the implemented router that every server adapter runs.

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

```ts
// server.ts
import { createImplementer } from '@ts-pf/server'
import { contract } from './contract.js'

export type AppCtx = { db: Db; user?: User }

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

Naming: the contract helper is `router`, so the implemented tree is always `app`. Feature slices nest: `router({ planet: planetContract })` on the contract side, `impl.router({ planet: planetApp })` on the app side. There is no `mergeRouters`.

## Context

`$context<C>()` is the **only** source of the context type. It declares what every handler receives, including keys that middleware will add later (`user?: User`). Middleware runtime-merges what it passes to `next({ context })` but does not widen the type the handler sees, so declare optional keys up front. This is a known cost, recorded in [`DECISIONS.md`](../DECISIONS.md) ("Middleware does not narrow context").

`impl.router()` carries that type on the app as a type-only brand (`ImplementedRouter<T, TCtx>`). Every adapter reads it from there, so you declare the context type once and the `context` you pass to an adapter is checked against it:

```ts
import { createLocalClient } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { PortHandler } from '@ts-pf/message-server'
import { app } from './server.js'

// All three infer AppCtx from `app`. A wrong or missing key is a type error.
const handler = new FetchHandler(app)
await handler.handle(request, { prefix: '/rpc', context: (req) => ({ db }) })
new PortHandler(app).bind(port, { context: () => ({ db }) })
const caller = createLocalClient(app, { context: { db } })
```

Only a tree produced by `impl.router()` carries the brand; a plain object of handlers infers `unknown`. The HTTP `Request` is not part of the context type unless you put it there: a context factory on `handle()` receives it, so keep transport-specific values (headers, the request) in the factory and give handlers transport-neutral context where you can. If handlers do need the request, declare `req: Request` on `AppCtx` and accept that message transports then need their own implementer (see the root README's message snippet).

## Middleware: `.use()` and `.useAfter()`

Middleware wraps the handler inside one procedure, on the implementer (`impl.use(mw)` applies to every procedure below it) or on a single builder (`impl.planet.find.use(mw)`). `impl.middleware(fn)` names a reusable middleware for `impl.use()`; a per-procedure `.use()` takes an inline function, because its `next()` is typed with that procedure's output.

- `.use()` runs **before** input validation. It sees `input: unknown`. Use it for auth, logging, anything that must run even when the input is garbage.
- `.useAfter()` runs **after** input validation. It sees the typed, parsed input (when the input check ran; with `validation.input: false` it sees the raw value). Use it for per-record authorization that needs the parsed id.

Inside middleware, `next({ context })` **merges** into the current context (`{ ...ctx, ...added }`). `next({ input })` replaces the input. The `errors` factory on middleware is the loose one (`errors.ANY_CODE(data?)`), because middleware is not tied to one procedure's declared map; the handler's `errors` is typed from the map.

```ts
import { createImplementer } from '@ts-pf/server'
import { PFError } from '@ts-pf/protocol'
import { contract } from './contract.js'

const impl = createImplementer(contract).$context<{ db: Db; token?: string; user?: User }>()

const requireUser = impl.middleware(async ({ context, next }) => {
  const user = await auth(context.token)
  if (!user) throw new PFError({ code: 'UNAUTHORIZED', status: 401 })
  return next({ context: { user } }) // merged; the handler still sees user?: User
})
```

## Links and adapters: every wire is an adapter

`@ts-pf/server` and `@ts-pf/client` know nothing about HTTP. The server port is `runProcedure(proc, input, context)`; the client port is `Link.call(path, input, signal)`. Everything that moves bytes is an adapter around one of those two functions:

| Side | Fetch (default) | MessagePort / WebSocket / stdio | In-process |
|---|---|---|---|
| Server | `FetchHandler` (`@ts-pf/server-http`) | `PortHandler` / `WsHandler` / `StdioHandler` (`@ts-pf/message-server`) | `createLocalClient` (`@ts-pf/server`) |
| Client | `FetchLink` (`@ts-pf/client-http`) | `PortLink` / `WsLink` / `StdioLink` (`@ts-pf/message-client`) | the same `createLocalClient` |

`createClient<typeof contract>(link)` is the same typed proxy over any `Link`. A custom transport is a class with one `call` method, not a fork of the client. `FetchHandler` is Fetch `Request` / `Response` only; Node has no built-in Fetch server, so the README's "Serving FetchHandler" section lists userland bridges. ts-pf ships none.

## Codecs

Over HTTP, a **codec** decides how the envelope becomes a body. `JSONCodec` is the default and emits `application/json`. The opt-in codecs wrap it without changing the contract: `MultipartCodec` (`@ts-pf/file`) for `File` / `Blob` values, `StreamCodec` (`@ts-pf/stream`) for root `AsyncIterable` as JSONL, `SseCodec` (`@ts-pf/sse`) for SSE output framing.

The handler and the link **must use the same codec**. A `FetchLink` with `StreamCodec` talking to a `FetchHandler` without it gets a JSON body where it expects JSONL frames; a handler with `MultipartCodec` behind a plain link never receives a file. The symptom is a `BAD_REQUEST` or a silently wrong shape, not a message that says "codec mismatch", so construct the codec in one shared module and pass `{ codec }` to both constructors. Message transports do not use codecs at all; they frame the same envelopes as JSON text.

## Interceptors: three onions, one rule

There are three places to hook a call, and they see different things:

| Hook | Package | Sees | Runs where |
|---|---|---|---|
| `HandlerPlugin` (`CORSPlugin`, `RequestLimitPlugin`, header plugins) | `@ts-pf/server-http` | HTTP `Request` / `Response`, context | `FetchHandler` only (`plugins`) |
| `CallInterceptor` / `CallPlugin` (`onStart`, `DedupePlugin`, `RetryPlugin`, `CachePlugin`) | `@ts-pf/server` and `@ts-pf/client` | `path`, `input`, result; on the server also `context` and `procedure` | Around `runProcedure` (server: `FetchHandler` / message handlers / `createLocalClient` `{ interceptors }`) or around `Link.call` (client: `createClient(link, { plugins, interceptors })`) |
| Fetch `Interceptor` | `@ts-pf/client-http` | Raw `fetch` `Request` / `Response` / throws | `FetchLink` (`interceptors`) |

The one-line rule: **if it needs a `Request` or `Response`, it is a `HandlerPlugin` (server) or a Fetch `Interceptor` (client); if it needs the procedure path, input, or result, it is a call interceptor; if it changes what the handler receives as context, it is middleware.**

Two details that bite:

- In **middleware**, `next({ context })` merges. In a server **call interceptor**, `next({ context })` **replaces** the context entirely. Spread the old one if you add a key.
- Fetch interceptors see raw fetch failures, not `PFError`s, so `isLocalFailure` is meaningless there. `RetryPlugin` is a call interceptor and may use it.

Call interceptors are transport-neutral: the same `DedupePlugin` runs under `FetchHandler`, `PortHandler`, and `createLocalClient`. `HandlerPlugin` never leaves HTTP. Order is array order; `[0]` is outermost.

## Validation defaults

| Check | Default | Switch |
|---|---|---|
| Server input schema (including stream input items) | on | `validation: { input: false }` on the adapter |
| Server output schema (including stream output items) | **off** | `validation: { output: true }` on the adapter |
| Declared error `data` schema | always on | none |
| Client-side input validation | off | none; the server validates |

`validation` is set on the adapter constructor (`FetchHandler`, `PortHandler`, `createLocalClient`, `runProcedure` options), not on `createImplementer`.

`validation.output: true` costs one schema walk per response (and per stream item) for the lifetime of the deployment. It catches a handler returning the wrong shape: a unary output failure is sent as `INTERNAL` with no issues (the bug is yours, and the schema's issues would leak internals); a bad stream item is `VALIDATION` with `issues`, in-band after the stream started. It also applies the parsed output (strip unknown keys, defaults, transforms), which otherwise is not applied. Turn it on in tests and staging; decide per deployment in production.

## Where to go next

- [Errors](errors.md): `PFError`, declared errors, the closed code set, `status` per transport.
- [Testing](testing.md): the in-process pattern the repo's examples use.
- [Coming from tRPC / oRPC](coming-from-trpc-orpc.md): name mapping and what is different.
