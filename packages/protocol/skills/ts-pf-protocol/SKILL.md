---
name: ts-pf-protocol
description: Use when throwing or handling ts-pf PFError, localFailure, PROTOCOL_VERSION, or the JSON RPC envelope, or writing a codec / adapter that needs toWireError or isAsyncIterable. Triggers: @ts-pf/protocol, PFError, isPFError, localFailure, ProtocolErrorCode, toWireError, isAsyncIterable.
---

# @ts-pf/protocol

Portable JSON envelope and `PFError`. No HTTP server, no schemas, no codecs.

Install: `npm i @ts-pf/protocol`

Link for agents: `npx skills experimental_sync -y`

Wire spec ships as `PROTOCOL.md` in this package.

## Do

```ts
import { PFError, isPFError, localFailure } from '@ts-pf/protocol'

throw new PFError({ code: 'UNAUTHORIZED', status: 401, message: 'Nope' })
new PFError({ code: 'TEAPOT' }).status // undefined — no default
// localFailure('Request aborted') → INTERNAL, local: true, status: 0 (not on the wire)
```

Envelope: `{ input }`, `{ ok: true, output }`, `{ ok: false, error: { code, message, data? } }`. Discriminator is JSON `error.code`.

`PFError.status?: number` is transport metadata, not identity. It is the HTTP response status on a unary Fetch failure, `undefined` on message transports and after a stream has started, and `0` on local failures. Guard it (`err.status ?? 400`); switch on `code`. The HTTP default (400 for a code with no status) is applied by `httpStatus()` in `@ts-pf/http`, not by the constructor.

Writing a codec or transport adapter: `toWireError(error)` is the failure envelope's `error` for any thrown value (`PFError` → `toJSON()`; anything else → fixed `{ code: 'INTERNAL', message: 'Internal server error' }`, no stack, no message leak — log the original value yourself). `isAsyncIterable(value)` is the shared "is this a stream" predicate (object or function with a `Symbol.asyncIterator` function). A `ReadableStream` is async-iterable on Node; a site that wants bytes excludes it explicitly.

## API

- `PFError`, `PFErrorInit`, `isPFError`, `localFailure`, `ProtocolErrorCode`
- `PROTOCOL_VERSION`, `RpcRequest`, `RpcResponse`, `RpcSuccess`, `RpcFailure`, `PFResultPromise`
- `toWireError`, `isAsyncIterable`

## Pair with

- App errors in handlers: `ts-pf-server` (`errors.CODE()` or `PFError`)
- Client narrowing: `ts-pf-client` (`asResult`, `isLocalFailure`)
- HTTP status map: `ts-pf-http` (`httpStatus`)

## Don't

- `JSONCodec`, `RpcCodec`, `PROTOCOL_HEADER`, or `FetchHandler` here.
- Put `status`, `cause`, or `local` in the JSON envelope (`toJSON` omits them).
- Redeclare `VALIDATION`, `INTERNAL`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE` on `.errors()`.
