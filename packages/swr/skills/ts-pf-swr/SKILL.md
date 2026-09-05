---
name: ts-pf-swr
description: Use when wiring a ts-pf client to SWR with createSwr keys, fetchers, mutators, matchers, or subscribers. Triggers: @ts-pf/swr, createSwr, useSWR, swr.fetcher.
---

# @ts-pf/swr

Opt-in SWR helpers for a ts-pf **client**. You still call `useSWR` yourself.

Install: `npm i @ts-pf/swr` (peer `swr`)

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { createSwr } from '@ts-pf/swr'
import useSWR from 'swr'

const swr = createSwr(client)
const { data, error } = useSWR(
  swr.planet.find.key({ input: { id: 123 } }),
  swr.planet.find.fetcher(),
)
```

Skip with a null key: `id ? swr.planet.find.key({ input: { id } }) : null`. Mutations: `useSWRMutation(swr.planet.list.key(), swr.planet.create.mutator())`. Pass `{ prefix: 'user' }` when two trees would share keys.

SWR `error` is the thrown `PFError`. Fetchers do not wrap `asResult`. Streams: `.subscriber()` / `.liveSubscriber()`.

## API

- `createSwr`
- procedure utils: `key`, `fetcher`, `mutator`, `matcher`, `subscriber`, `liveSubscriber`, `.call`

## Pair with

- Client: `ts-pf-client`
- Generated `Contract`: `ts-pf-codegen`
- Retry: `RetryPlugin` on `createClient`, not here

## Don't

- Wrap `useSWR` as `swr.planet.find.useSWR(input)`.
- TanStack Query.
- Switch RPC to GET or fold into `@ts-pf/client`.
