# Testing

ts-pf apps are tested without a port. Every example in [`examples/`](../examples/README.md) runs its client against its handler in-process, and the two patterns below are all they use. Snippets assume [Vitest](https://vitest.dev) but nothing here depends on it.

The app under test on this page: the README contract (`planet.list` / `find` / `create`) with an inline auth middleware on `create`.

```ts
// server.ts
import { createImplementer } from '@ts-pf/server'
import { PFError } from '@ts-pf/protocol'
import { contract } from './contract.js'

export type AppCtx = { db: Db; user?: User }

const impl = createImplementer(contract).$context<AppCtx>()

export const app = impl.router({
  planet: {
    list: impl.planet.list.handler(({ context }) => context.db.planets.all()),
    find: impl.planet.find.handler(async ({ input, context, errors }) => {
      const row = await context.db.planets.get(input.id)
      if (!row) throw errors.NOT_FOUND({ id: input.id })
      return row
    }),
    create: impl.planet.create
      .use(async ({ context, next }) => {
        if (!context.user) throw new PFError({ code: 'UNAUTHORIZED', status: 401 })
        return next()
      })
      .handler(({ input, context }) => context.db.planets.create(input)),
  },
})
```

## Two ways in

**Through the wire, without a socket.** `FetchHandler.handle(request)` takes a Fetch `Request` and returns a `Response`, and `FetchLink` accepts a `fetch` function. Hand the link a stub that calls the handler. Everything runs: the codec, the envelope, `HandlerPlugin`s, `httpStatus`, Fetch interceptors, and client plugins. This is the closest thing to production and is what `examples/hello/tests/smoke.test.ts` does.

```ts
// rpc.ts
import { FetchHandler } from '@ts-pf/server-http'
import { app } from './server.js'

export const handler = new FetchHandler(app, { validation: { output: true } })

export const rpc = async (request: Request): Promise<Response> => {
  const result = await handler.handle(request, {
    prefix: '/rpc',
    context: () => ({ db }),
  })
  if (!result.matched) return new Response('Not Found', { status: 404 })
  return result.response
}
```

```ts
// client.ts
import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { contract } from './contract.js'
import { rpc } from './rpc.js'

// FetchLink calls this instead of the global fetch. No port is opened.
const fetchImpl: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init)
  return rpc(request)
}

export const client = createClient<typeof contract>(
  new FetchLink({ url: 'http://test.local/rpc', fetch: fetchImpl }),
)
```

```ts
// client.test.ts
import { expect, it } from 'vitest'
import { client } from './client.js'

it('finds a planet', async () => {
  expect(await client.planet.find({ id: 1 })).toEqual({ id: 1, name: 'Earth' })
})
```

The `url` only needs to be absolute so `new Request()` accepts it; nothing resolves `test.local`. Pass the same `codec` to both sides when the app uses `StreamCodec`, `MultipartCodec`, or `SseCodec`.

**Skipping the wire.** `createLocalClient(app, { context })` gives the same typed client over `runProcedure` directly: middleware, validation, declared errors, and server call interceptors all run, but no codec and no HTTP status. Use it to unit-test handlers and middleware with a context you build by hand. The `context` argument is typed from `app`, so a test that forgets a key fails to compile.

```ts
// local.test.ts
import { createLocalClient } from '@ts-pf/server'
import { expect, it } from 'vitest'
import { app } from './server.js'

it('lists planets', async () => {
  const caller = createLocalClient(app, { context: { db }, validation: { output: true } })
  expect(await caller.planet.list()).toHaveLength(2)
})
```

Turn on `validation: { output: true }` in tests, on either path, as above. It is off in production by default and is the only thing that catches a handler returning the wrong shape.

## Declared errors

Wrap the call in `asResult` and narrow on `code`. The `data` type comes from the contract, so the assertion is typed too.

```ts
// errors.test.ts
import { asResult } from '@ts-pf/client'
import { expect, it } from 'vitest'
import { client } from './client.js'

it('reports a missing planet', async () => {
  const result = await asResult(client.planet.find({ id: 999 }))
  expect(result.ok).toBe(false)
  if (!result.ok && result.error.code === 'NOT_FOUND') {
    expect(result.error.data).toEqual({ id: 999 })
  }
})
```

Over `FetchLink`, `result.error.status` is the HTTP status (`404` for a declared `{ status: 404 }`); over `createLocalClient` it is the declared `ErrorDef.status`; over message links it is `undefined`. Assert on `code`, and on `status` only in a test that is specifically about the HTTP binding. See [Errors](errors.md#status-per-transport).

Input validation needs no special setup: call with a bad input through a cast and expect `VALIDATION` with `data.issues`.

## Middleware and context

Middleware reads what the context factory put in and adds to it. Test it by varying the context: `createLocalClient` takes the context as a value, and `handle()` takes a factory, so both are one argument away from a "logged out" case.

```ts
// auth.test.ts
import { asResult } from '@ts-pf/client'
import { createLocalClient } from '@ts-pf/server'
import { expect, it } from 'vitest'
import { app } from './server.js'

it('rejects anonymous callers', async () => {
  const anonymous = createLocalClient(app, { context: { db } })
  const result = await asResult(anonymous.planet.create({ name: 'Venus' }))
  expect(result.error?.code).toBe('UNAUTHORIZED')
})

it('lets a user through', async () => {
  const signedIn = createLocalClient(app, { context: { db, user: { id: 'u1' } } })
  expect(await signedIn.planet.create({ name: 'Venus' })).toMatchObject({ name: 'Venus' })
})
```

Keys that middleware adds or reads (`user`) are declared on `$context<AppCtx>()` as optional, so a test can pre-fill them and skip the real `auth()`. A `PFError` thrown by middleware with an undeclared code (`UNAUTHORIZED` above) reaches the client at runtime, but it is not in the `ClientError` union (declared codes plus protocol codes, no catch-all), so `result.error.code === 'UNAUTHORIZED'` does not type-check. Assert through `expect(...).toBe(...)` as above, or declare the code on `.errors()` of the procedures the middleware guards.

## Streams

A procedure whose output is `stream(schema)` resolves to an `AsyncIterable`. Collect it with `for await`. Through `FetchLink` this needs `StreamCodec` on both sides; through `createLocalClient` it works without a codec.

```ts
// chat-client.ts
import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import { procedure, router } from '@ts-pf/contract'
import { stream, StreamCodec } from '@ts-pf/stream'
import { z } from 'zod'

export const chatContract = router({
  chat: procedure.input(z.object({ prompt: z.string() })).output(stream(z.object({ token: z.string() }))),
})

export const client = createClient<typeof chatContract>(
  new FetchLink({ url: 'http://test.local/rpc', codec: new StreamCodec() }),
)
```

```ts
// stream.test.ts
import { expect, it } from 'vitest'
import { client } from './chat-client.js'

it('streams tokens', async () => {
  const tokens: string[] = []
  for await (const item of await client.chat({ prompt: 'hi' })) {
    tokens.push(item.token)
  }
  expect(tokens).toEqual(['hel', 'lo'])
})
```

A failure after the stream started rejects the iterator (the `for await` throws) with a `PFError` whose `status` is `undefined`. Stream input is the mirror image: pass an async generator as the input and assert on the unary result (`examples/stream/tests/smoke.test.ts` does both).

Message transports need no stub at all: `examples/message/tests/smoke.test.ts` binds `PortHandler` to `port1` of a `MessageChannel`, hands `port2` to `PortLink`, and closes both in `finally`.

## Running the repo's examples

Examples import `@ts-pf/*` from each package's `dist`, so build once from the repo root:

```sh
npm install && npm run build
npm test                          # every package and example via Turborepo
cd examples/hello && npm test     # one example
cd examples/hello && npm run dev  # hello only: listens on http://127.0.0.1:8787
```

Each example README has the same three sections ("What it shows", "Run", "What the smoke test asserts"); [`examples/README.md`](../examples/README.md) has the suggested order. Only `hello` listens on a port, through an example-local `node:http` bridge that is not a published adapter.
