# @ts-pf/client

`createClient()`, `Link`, `intercept()` / `CallPlugin`, `RetryPlugin` / `DedupePlugin` / `CachePlugin`, `asResult()`, and `isLocalFailure()` for [ts-pf](https://github.com/crobinson42/ts-pf#readme). A typed proxy over any `Link`; the Fetch link is `@ts-pf/client-http`. Never imports server code.

## Install

```sh
npm i @ts-pf/contract @ts-pf/server @ts-pf/server-http @ts-pf/client @ts-pf/client-http zod
```

## Call

```ts
// client.ts — `contract` is the router from @ts-pf/contract (planet.list / find / create)
import { asResult, createClient, isLocalFailure, RetryPlugin } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { contract } from './contract.js' // type-only import: no server code ships

export const client = createClient<typeof contract>(new FetchLink({ url: '/rpc' }), {
  plugins: [new RetryPlugin()], // 3 retries on local failures (network), not aborts
})

const planet = await client.planet.find({ id: 1 }) // throws PFError on failure
const planets = await client.planet.list()
// optional last arg on every call: { signal?: AbortSignal }

const result = await asResult(client.planet.find({ id: 1 }))
if (!result.ok) {
  if (isLocalFailure(result.error)) {
    // network error or abort — the request never reached the server
  } else if (result.error.code === 'NOT_FOUND') {
    result.error.data.id // typed from .errors() on the contract
  }
}
```

`asResult` is optional DX; any HTTP client can read the same `{ ok: false, error: { code, message, data? } }` envelope and switch on `error.code`. Client-side input validation is off by default. A connection dropped after the request was sent is a local failure too, so `RetryPlugin` can re-send a write that already landed; pass `retry` to exclude non-idempotent procedures.

## Dedupe and cache are not read-only by default

`DedupePlugin` and `CachePlugin` key on `JSON.stringify([path, input])` for **every** unary call, mutations included: two concurrent `planet.create({ name: 'x' })` calls would share one request and resolve to the same id. Pass `key` and return `undefined` for anything that is not a read.

```ts
import { CachePlugin, createClient, DedupePlugin, RetryPlugin } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { contract } from './contract.js'

const readKey = ({ path, input }: { path: string[]; input: unknown }) =>
  path.join('.') === 'planet.find' ? JSON.stringify([path, input]) : undefined

const client = createClient<typeof contract>(new FetchLink({ url: '/rpc' }), {
  plugins: [
    new RetryPlugin(),
    new DedupePlugin({ key: readKey }),
    new CachePlugin({ ttl: 5_000, key: readKey }), // success only; ttl required
  ],
})
```

Happy path with the matching server: [root README](https://github.com/crobinson42/ts-pf#readme). Message links (`PortLink` / `WsLink` / `StdioLink`) are `@ts-pf/message-client`.

## Agent skills

This package ships [`ts-pf-client`](https://github.com/crobinson42/ts-pf/blob/main/packages/client/skills/ts-pf-client/SKILL.md). Sync with `npx skills experimental_sync -y`.
