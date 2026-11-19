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

Detect a failure with `isPFError(error)` rather than `instanceof PFError`: it also matches a `PFError` from another installed copy of this package (version skew, or a bundler that inlined one), through a brand on `PFError.prototype`.

Two helpers the transports share, for codecs and adapters of your own: `toWireError(error)` is the `error` object of a failure envelope for any thrown value — a `PFError`'s `toJSON()`, anything else a fixed `{ code: 'INTERNAL', message: 'Internal server error' }` with no stack or message leak (log the original yourself). The message transports use it for the `hello-error` of a refused connection too, so a `PFError` thrown from a message handler's context factory reaches the client as its code. `isAsyncIterable(value)` is the one answer to "is this a stream" (a non-null object or function with a `Symbol.asyncIterator` function; a `ReadableStream` counts on Node, so exclude it at a site that wants bytes). `defined(obj)` returns a shallow copy without the keys whose value is `undefined`, typed with those keys optional — the one helper for forwarding optional fields under `exactOptionalPropertyTypes` (`{ ...required, ...defined({ signal }) }`).

Wire spec: [`PROTOCOL.md`](https://github.com/crobinson42/ts-pf/blob/main/packages/protocol/PROTOCOL.md), revision 1.2 (also shipped in this package). It is written for implementers in any language: RFC 2119 keywords, one-screen HTTP and WebSocket client checklists, the rule for classifying an HTTP response (a body that does not decode as an envelope is a transport failure, never an application outcome read off the HTTP status), WebSocket close-code ranges, and the TypeScript client's own conventions (`local`, `status: 0`, error messages) in an appendix. Happy path: [root README](https://github.com/crobinson42/ts-pf#readme).

Conformance fixtures: [`conformance/`](https://github.com/crobinson42/ts-pf/tree/main/packages/protocol/conformance) (also shipped in this package) holds language-neutral JSON test vectors versioned with the spec revision — `http.json` (unary requests and response classification), `http-stream.json` (JSONL streams), and `ws.json` (WebSocket frame scripts). A client written in any language replays them against its own code to prove it follows `PROTOCOL.md`; the directory's `README.md` is the runner spec. They are data, not schemas. The TypeScript clients are tested against the same files. TypeScript runners can import them typed:

```ts
import { httpConformance, wsConformance } from '@ts-pf/protocol/conformance'

for (const testCase of httpConformance.cases) {
  // testCase.request → call your client; testCase.expectRequest → check what it sent;
  // testCase.response → answer it; testCase.expect → check what the caller saw.
}
```

## API

- `PFError`, `PFErrorInit`, `isPFError`, `localFailure`, `ProtocolErrorCode`
- `PROTOCOL_MAJOR` (`1`, the wire major: `v` on message `hello`), `PROTOCOL_VERSION` (`'1'`, its string: the `x-ts-pf-protocol` header value), `RpcRequest`, `RpcResponse`, `RpcSuccess`, `RpcFailure`, `PFResultPromise`
- `toWireError`, `isAsyncIterable`
- `isUnexpectedError(error)` — `true` for a non-`PFError` or an `INTERNAL` `PFError` (no `cause` unwrapping): what `FetchHandler` and `@ts-pf/mcp` log by default when no `onError` is given, for a custom `onError` that keeps the same filter
- `defined`, `Defined` — `defined(obj)` drops the keys whose value is `undefined`, so `{ ...required, ...defined({ signal }) }` builds an `exactOptionalPropertyTypes` option bag without one spread per field
- `@ts-pf/protocol/conformance`: `httpConformance`, `httpStreamConformance`, `wsConformance` (the `conformance/*.json` fixtures, typed) and their types `ConformanceFile`, `HttpCase`, `HttpExpect`, `HttpStreamExpect`, `HttpStreamEnd`, `WsCase`, `WsStep`, `WsExpectation`, `ConformanceRequest`, `ConformanceError`, `JsonValue`

## Agent skills

This package ships [`ts-pf-protocol`](https://github.com/crobinson42/ts-pf/blob/main/packages/protocol/skills/ts-pf-protocol/SKILL.md). Sync with `npx skills experimental_sync -y`.
