# codegen

Split-repo `createClient<Contract>`. The client package cannot import the live server contract — `catalog()` is the handoff, `@ts-pf/codegen` prints the `.d.ts`.

## Overview

```markdown
The backend team does not need to hand-maintain a catalog.json file. The live TypeScript contract is the source of truth. catalog(contract) derives the JSON spec from that.

What the backend actually maintains

1. The contract (procedure / router).
2. A call to catalog(contract, { prefix: '/rpc' }).
3. Some way for the client team to get that JSON.

The usual way is to serve it in userland, not from FetchHandler:

if (url.pathname === '/catalog.json') {
  return Response.json(catalog(contract, { prefix: '/rpc' }))
}
const result = await handler.handle(req, { prefix: '/rpc', context })

That is what examples/codegen/server does. There is no edited catalog file in the request path — the running server prints the current contract as JSON.

How the client team consumes it

• URL: ts-pf-codegen pull https://api.example.com/catalog.json -o contract.d.ts
• File/artifact: ts-pf-codegen emit catalog.json -o contract.d.ts

A file is only needed if you choose a file-based handoff (CI artifact, S3, a gist, a committed snapshot). It is still generated, never authored.

Why this example commits server/catalog.json

That file is a snapshot of catalog(), so you can inspect the spec and run emit without starting a server. The smoke test fails if it drifts from catalog(contract). It is not a second source of truth.

In a real split repo, backend CI can write that snapshot as a build artifact, or skip the file entirely and just serve GET /catalog.json. The client commits contract.d.ts (and optionally a catalog.lock.json hash from pull).
```

## Project Structure

```
server/     live contract, implementer, FetchHandler, GET /catalog.json
client/     generated Contract + createClient<Contract>(FetchLink)
```

```ts
import { catalog } from '@ts-pf/docs'
import { emit } from '@ts-pf/codegen'

const spec = catalog(contract, { prefix: '/rpc' })
```

```
ts-pf-codegen emit server/catalog.json -o client/src/contract.d.ts
```

```ts
import { asResult, createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { Contract } from './contract.js'

const client = createClient<Contract>(new FetchLink({ url: '/rpc' }))
await client.planet.find({ id: 1 })

const result = await asResult(client.planet.find({ id: 1 }))
if (!result.ok && result.error.code === 'NOT_FOUND') {
  result.error.data.id
}
```

Serve `catalog.json` in userland, not `FetchHandler`. Refresh committed artifacts with `npm run generate` in this folder.
