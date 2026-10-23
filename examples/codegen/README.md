# codegen

Split-repo `createClient<Contract>`. The client package cannot import the live contract, so `catalog()` is the handoff and `@ts-pf/codegen` prints the `.d.ts`.

## What it shows

```
server/     live contract, implementer, FetchHandler, GET /catalog.json
client/     generated Contract + createClient<Contract>(FetchLink)
```

The server team maintains the contract (`procedure` / `router`), one `catalog(contract, { prefix: '/rpc' })` call, and a way to hand that JSON to the client team. Nobody edits a catalog file: the running server prints the current contract. Here the JSON is served in userland, before `FetchHandler`:

```ts no-check
if (url.pathname === '/catalog.json') return Response.json(spec)
const result = await handler.handle(req, { prefix: '/rpc', context })
```

The client team turns it into types with `ts-pf-codegen pull https://api.example.com/catalog.json -o contract.d.ts` from a URL, or `ts-pf-codegen emit catalog.json -o contract.d.ts` from a file. A file is only needed for a file-based handoff (CI artifact, bucket, committed snapshot), and it is generated, never authored.

```ts
import { asResult, createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { Contract } from './contract.js'

const client = createClient<Contract>(new FetchLink({ url: '/rpc' }))
const result = await asResult(client.planet.find({ id: 1 }))
if (!result.ok && result.error.code === 'NOT_FOUND') result.error.data.id
```

`server/catalog.json` is committed as a snapshot of `catalog()` so the spec can be read and `emit` run without starting a server. It is not a second source of truth: the smoke test fails when it drifts. In a real split repo, backend CI writes that snapshot as an artifact or skips the file and serves `GET /catalog.json`; the client commits `contract.d.ts` (and optionally a `catalog.lock.json` hash from `pull`).

## Run

Build the packages once from the repo root (`npm install && npm run build`), then in this folder:

```sh
npm test            # smoke test
npm run generate    # rewrite server/catalog.json + client/src/contract.d.ts from the live contract
```

## What the smoke test asserts

`tests/smoke.test.ts` checks that `client/package.json` and `client/src` reference nothing server-side (`@ts-pf/server`, `@ts-pf/docs`, `@ts-pf/codegen`, the server package, any `/server` import); that `catalog.json` equals `catalog(contract)` and `contract.d.ts` equals `emit(spec)`; that `GET /catalog.json` returns the spec; and that `list` / `find` / `create` work from the generated `Contract`, with `asResult` narrowing `NOT_FOUND` to `error.data.id`.
