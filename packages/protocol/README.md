# @ts-pf/protocol

Portable JSON envelope, `PFError`, `localFailure`, and `PROTOCOL_VERSION` for [ts-pf](https://github.com/crobinson42/ts-pf#readme). Every transport (Fetch, WebSocket, stdio, MessagePort) carries these same shapes. No HTTP server, no schemas, no codecs.

## Install

```sh
npm i @ts-pf/contract @ts-pf/server @ts-pf/server-http @ts-pf/client @ts-pf/client-http zod
```

`@ts-pf/protocol` is a dependency of `@ts-pf/server` and `@ts-pf/client`; install it directly when you import `PFError` yourself.

## Use

```ts
import { PFError, isPFError, localFailure, PROTOCOL_VERSION } from '@ts-pf/protocol'

// Server: throw from a handler or middleware. `status` is an HTTP hint that
// FetchHandler uses for Response.status; the envelope carries only
// { code, message, data? }. Declared errors use `errors.CODE(data)` instead.
export function requireAdmin(user: { role: string }) {
  if (user.role !== 'admin') {
    throw new PFError({ code: 'FORBIDDEN', status: 403, message: 'Admins only' })
  }
}

// Client: every failure surfaces as a PFError again (or use asResult()).
export function describeFailure(error: unknown): string {
  if (!isPFError(error)) return 'not an RPC failure'
  if (error.local) return `never reached the server: ${error.message}`
  return `${error.code}: ${error.message}`
}

// Wire shape, identical for curl and non-TS clients:
//   POST /rpc/planet/find            { "input": { "id": 1 } }
//   200  { "ok": true, "output": { "id": 1, "name": "Earth" } }
//   404  { "ok": false, "error": { "code": "NOT_FOUND", "message": "…", "data": { "id": 9 } } }
PROTOCOL_VERSION // x-ts-pf-protocol header value on every RPC request and response; FetchHandler / FetchLink reject other values
localFailure('Request aborted') // INTERNAL with local: true, status 0 (never on the wire)
```

The discriminator is JSON `error.code`. `status`, `cause`, and `local` never appear in the envelope (`toJSON` omits them).

Two helpers the transports share, for codecs and adapters of your own: `toWireError(error)` is the `error` object of a failure envelope for any thrown value — a `PFError`'s `toJSON()`, anything else a fixed `{ code: 'INTERNAL', message: 'Internal server error' }` with no stack or message leak (log the original yourself). `isAsyncIterable(value)` is the one answer to "is this a stream" (a non-null object or function with a `Symbol.asyncIterator` function; a `ReadableStream` counts on Node, so exclude it at a site that wants bytes). `defined(obj)` returns a shallow copy without the keys whose value is `undefined`, typed with those keys optional — the one helper for forwarding optional fields under `exactOptionalPropertyTypes` (`{ ...required, ...defined({ signal }) }`).

Wire spec: [`PROTOCOL.md`](https://github.com/crobinson42/ts-pf/blob/main/packages/protocol/PROTOCOL.md) (also shipped in this package). Happy path: [root README](https://github.com/crobinson42/ts-pf#readme).

## API

- `PFError`, `PFErrorInit`, `isPFError`, `localFailure`, `ProtocolErrorCode`
- `PROTOCOL_MAJOR` (`1`, the wire major: `v` on message `hello`), `PROTOCOL_VERSION` (`'1'`, its string: the `x-ts-pf-protocol` header value), `RpcRequest`, `RpcResponse`, `RpcSuccess`, `RpcFailure`, `PFResultPromise`
- `toWireError`, `isAsyncIterable`
- `defined`, `Defined` — `defined(obj)` drops the keys whose value is `undefined`, so `{ ...required, ...defined({ signal }) }` builds an `exactOptionalPropertyTypes` option bag without one spread per field

## Agent skills

This package ships [`ts-pf-protocol`](https://github.com/crobinson42/ts-pf/blob/main/packages/protocol/skills/ts-pf-protocol/SKILL.md). Sync with `npx skills experimental_sync -y`.
