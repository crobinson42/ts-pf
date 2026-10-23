# Errors

How a failure is represented, thrown, sent, and narrowed. The wire shapes here are taken from [`PROTOCOL.md`](../packages/protocol/PROTOCOL.md); the per-transport `status` table is the one in the `ts-pf-client` skill. If this page and either of those disagree, they win.

## `PFError`

Every failure in ts-pf is a `PFError` from `@ts-pf/protocol`. The install line in the README does not name that package because `@ts-pf/server` and `@ts-pf/client` both depend on it, so it is already in `node_modules`; import it directly. If your package manager does not let you import an undeclared transitive dependency (pnpm in strict mode), add `@ts-pf/protocol` to your own `dependencies`.

```ts
import { PFError } from '@ts-pf/protocol'

throw new PFError({ code: 'UNAUTHORIZED', status: 401, message: 'Sign in first' })
```

`PFError` is `{ code, message, data?, status?, cause?, local? }`. Only `code`, `message`, and `data` go on the wire (`toJSON()` omits the rest). `code` is the identity: switch on it. `status` is optional transport metadata with no default (see [`status` per transport](#status-per-transport)). `message` defaults to the code string when you omit it, on a hand-built `PFError` and on declared errors alike.

## Declared errors

Declare the codes a procedure can fail with on the contract. Each entry is an `ErrorDef`: `{ status?, message?, data? }`, all optional.

```ts
import { procedure } from '@ts-pf/contract'
import { z } from 'zod'

const find = procedure
  .input(z.object({ id: z.number() }))
  .output(z.object({ id: z.number(), name: z.string() }))
  .errors({
    NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
    ARCHIVED: { status: 410, message: 'Planet was archived' },
  })
```

In the handler, `errors.CODE(data)` builds and throws the matching `PFError`. It is typed from that procedure's map: a code with a `data` schema requires the data, a code without one takes no argument, and an undeclared code is a type error.

```ts
import { createImplementer } from '@ts-pf/server'
import { contract } from './contract.js'

const impl = createImplementer(contract).$context<{ db: Db }>()

impl.planet.find.handler(async ({ input, context, errors }) => {
  const row = await context.db.planets.get(input.id)
  if (!row) throw errors.NOT_FOUND({ id: input.id })
  return row
})
```

Defaults worth knowing:

- The default `message` is the **code string** (`'NOT_FOUND'`), not a sentence. Set `message` on the `ErrorDef` or pass a hand-built `PFError` when the text matters.
- `status` is HTTP / OpenAPI metadata only. Omit it and `FetchHandler` sends 400; message transports never see it.
- `data` is always validated against its schema when the error is thrown, regardless of `validation.output`. Data that fails the schema is a server bug and is sent as `INTERNAL` with no issues.
- Do not redeclare `VALIDATION`, `INTERNAL`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, or `PAYLOAD_TOO_LARGE`. They belong to the protocol. Reusing `NOT_FOUND` for a missing entity is fine.

A `PFError` thrown directly (`throw new PFError({ code: 'UNAUTHORIZED' })`) also reaches the client at runtime, with its code as-is. It is not in the client's `ClientError` union, though, which is exactly the declared codes plus the protocol codes with no string catch-all: `result.error.code === 'UNAUTHORIZED'` fails to type-check. Declare the code on `.errors()` (on the procedure, or on every procedure a shared middleware guards) when the client needs to narrow on it.

## The protocol code set

These six codes are closed. Every ts-pf server can emit them, no contract declares them, and every client must handle them as a catch-all.

| Code | HTTP | When |
|---|---|---|
| `BAD_REQUEST` | 400 | Invalid JSON or envelope, a bad message frame |
| `VALIDATION` | 422 | Input schema failed, or a stream item schema failed after the stream started. `data.issues` is `{ message, path }[]` |
| `NOT_FOUND` | 404 | Prefix matched, procedure missing (a declared `NOT_FOUND` reuses the code) |
| `METHOD_NOT_ALLOWED` | 405 | Non-POST (Fetch only) |
| `PAYLOAD_TOO_LARGE` | 413 | Body over `RequestLimitPlugin`'s cap, or a server-to-client message frame too large to send (`Frame too large`); an oversize inbound frame closes the connection instead |
| `INTERNAL` | 500 | Unknown throw, a unary output schema failure, invalid declared error `data` |

The HTTP column is `PROTOCOL_HTTP_STATUS` in `@ts-pf/http`, applied by `httpStatus()` in `FetchHandler`. Nothing stamps it into the JSON.

### What the JSON looks like

Every failure is `{ "ok": false, "error": { "code", "message", "data?" } }`. The messages below are the ones the TypeScript server sends; the spec fixes the keys, not the prose.

```json
{ "ok": false, "error": { "code": "BAD_REQUEST", "message": "Request body must be {\"input\": ...}" } }
{ "ok": false, "error": { "code": "VALIDATION", "message": "Validation failed", "data": { "issues": [{ "message": "Expected number, received string", "path": ["id"] }] } } }
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "Procedure not found" } }
{ "ok": false, "error": { "code": "METHOD_NOT_ALLOWED", "message": "Method not allowed" } }
{ "ok": false, "error": { "code": "PAYLOAD_TOO_LARGE", "message": "Request body too large" } }
{ "ok": false, "error": { "code": "INTERNAL", "message": "Internal server error" } }
```

A declared error carries whatever the handler passed, with the code as the default message:

```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "NOT_FOUND", "data": { "id": 1 } } }
```

`INTERNAL` never includes a stack, the thrown message, or output-schema issues. After a stream has started the HTTP status stays 200 and the same `error` object arrives as a JSONL line or an SSE `event: error`.

### The "body must be `{ input }`" 400

The request envelope is `{ "input": ... }`, not the input itself. Posting `{"id":1}` to `planet.find` is `400 BAD_REQUEST` with message `Request body must be {"input": ...}`; the fix is `{"input":{"id":1}}`. `{}` and `{"input":null}` both mean "no input". The same rule applies to the multipart `rpc` part and to each JSONL input line. `FetchLink` always sends the envelope, so this one only shows up with hand-written `curl` or a foreign client.

## On the client

Calls reject with a `PFError`. For typed narrowing use `asResult`, which turns the promise into a `CallResult<T, E>` whose `error` is the `ClientError` union: the procedure's declared codes (with typed `data`) plus the protocol codes the procedure did not redeclare.

```ts
import { asResult, isLocalFailure } from '@ts-pf/client'

// client: ContractClient<typeof contract> from createClient (see the README)
const result = await asResult(client.planet.find({ id: 1 }))
if (result.ok) {
  result.data.name
} else if (isLocalFailure(result.error)) {
  // never reached the server: network error or abort (local === true, code INTERNAL)
} else if (result.error.code === 'NOT_FOUND') {
  result.error.data.id // typed from the contract
} else if (result.error.code === 'VALIDATION') {
  result.error.data.issues // { message, path }[]
} else {
  result.error.code // the remaining protocol codes (a hand-thrown undeclared code lands here at runtime but is not in the type)
}
```

`isLocalFailure` is `local === true`, never `status === 0`. A **non-RPC** HTTP response (a proxy's HTML 502, a framework 404 without `x-ts-pf-protocol`) is **not** local: it is `INTERNAL` with the HTTP status, message `Non-RPC response (HTTP …)`, and the decode failure as `cause`. `RetryPlugin` retries local failures only.

Plain `try` / `catch` works too: `catch (e) { if (isPFError(e) && e.code === 'NOT_FOUND') … }` with `isPFError` from `@ts-pf/protocol`. `asResult` is TypeScript DX; any HTTP client parses the same envelope.

### `status` per transport

`result.error` (and a thrown `PFError`) is `{ code, message, data?, status? }`. Switch on `code`. `status` is optional transport metadata and means something different per `Link`:

| Link | `status` |
|---|---|
| `FetchLink`, unary failure | HTTP response status (declared `{ status: 404 }` → `404`, declared with no status → `400`, protocol codes → their HTTP table) |
| `FetchLink`, after a stream started (JSONL / SSE) | `undefined` |
| `PortLink` / `WsLink` / `StdioLink` | `undefined` |
| Local failure (`isLocalFailure`) | `0` |
| `createLocalClient` (server package) | declared `ErrorDef.status` or `undefined` |

`if (err.status === 404)` is only right over HTTP; write `if (err.code === 'NOT_FOUND')`. Arithmetic or `.toFixed()` on `status` needs `?? 400` or a guard.

## On the server

### `httpStatus()`

`FetchHandler` picks the response status with `httpStatus(error)` from `@ts-pf/http`: protocol codes map to the table above; any other code uses `error.status ?? 400`. That is the only place the 400 default lives. If you build your own Fetch adapter or log status codes, call the same function instead of re-deriving the table.

```ts
import { httpStatus } from '@ts-pf/http'
import { PFError } from '@ts-pf/protocol'

httpStatus(new PFError({ code: 'VALIDATION' })) // 422
httpStatus(new PFError({ code: 'TEAPOT', status: 418 })) // 418
httpStatus(new PFError({ code: 'TEAPOT' })) // 400
```

### `onError` and default logging

Unknown throws become `500 INTERNAL` with no stack on the wire. By default `FetchHandler` logs them with `console.error` (the original thrown value, tagged `[ts-pf/server-http]` with the procedure path). It also logs `INTERNAL` `PFError`s: an output schema failure under `validation.output`, invalid declared error `data`, or an explicit `INTERNAL` throw. Declared errors and every other protocol code (`VALIDATION`, `NOT_FOUND`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`) are expected and are not logged.

Pass `onError` to route errors to your own logger. It receives the original error (before `INTERNAL` mapping) for **every** error response, runs after each `HandlerPlugin.onError`, cannot replace the response (a throw from it rejects `handle()`), and turns the default logging off:

```ts
import { FetchHandler } from '@ts-pf/server-http'

new FetchHandler(app, {
  onError(error, { request, path, context }) {
    logger.error({ err: error, path: path.join('/'), url: request.url })
  },
})
```

Errors thrown after a streamed response has started (`StreamCodec` / `SseCodec` output) are written in-band by the codec as `INTERNAL` items; they do not reach `onError` or the default log. Message handlers (`PortHandler`, `WsHandler`, `StdioHandler`) take an `onError(error)` on their `HandlerOptions` that receives the error only, with no request and no HTTP status. For a hook that runs identically on every transport, use a server call interceptor (`onError` from `@ts-pf/server`) on `{ interceptors }`.
