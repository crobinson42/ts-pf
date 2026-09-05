---
name: ts-pf-protocol
description: Use when throwing or handling ts-pf PFError, localFailure, PROTOCOL_VERSION, or the JSON RPC envelope. Triggers: @ts-pf/protocol, PFError, isPFError, localFailure, ProtocolErrorCode.
---

# @ts-pf/protocol

Portable JSON envelope and `PFError`. No HTTP server, no schemas, no codecs.

Install: `npm i @ts-pf/protocol@beta`

Link for agents: `npx skills experimental_sync -y`

Wire spec ships as `PROTOCOL.md` in this package.

## Do

```ts
import { PFError, isPFError, localFailure } from '@ts-pf/protocol'

throw new PFError({ code: 'UNAUTHORIZED', status: 401, message: 'Nope' })
// localFailure('Request aborted') → INTERNAL, local: true, status: 0 (not on the wire)
```

Envelope: `{ input }`, `{ ok: true, output }`, `{ ok: false, error: { code, message, data? } }`. Discriminator is JSON `error.code`. `status` is a TS/HTTP hint, not identity.

## API

- `PFError`, `PFErrorInit`, `isPFError`, `localFailure`, `ProtocolErrorCode`
- `PROTOCOL_VERSION`, `RpcRequest`, `RpcResponse`, `RpcSuccess`, `RpcFailure`, `PFResultPromise`

## Pair with

- App errors in handlers: `ts-pf-server` (`errors.CODE()` or `PFError`)
- Client narrowing: `ts-pf-client` (`asResult`, `isLocalFailure`)
- HTTP status map: `ts-pf-http` (`httpStatus`)

## Don't

- `JSONCodec`, `RpcCodec`, `PROTOCOL_HEADER`, or `FetchHandler` here.
- Put `status`, `cause`, or `local` in the JSON envelope (`toJSON` omits them).
- Redeclare `VALIDATION`, `INTERNAL`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE` on `.errors()`.
