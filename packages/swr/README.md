# @ts-pf/swr

Opt-in [SWR](https://swr.vercel.app/) helpers for a ts-pf **client**. Typed keys, fetchers, mutators, matchers, and stream subscribers — you still call `useSWR` yourself.

This package does **not** wrap `useSWR`, add a React provider, switch RPC to GET, or fold into `@ts-pf/client`. Pass the client from `createClient<typeof contract>(link)` or `createClient<Contract>(link)` with a generated `Contract` from [`@ts-pf/codegen`](../codegen).

## Setup

```ts
import { createClient, FetchLink } from '@ts-pf/client'
import { createSwr } from '@ts-pf/swr'
import type { contract } from './contract'

const client = createClient<typeof contract>(new FetchLink({ url: '/rpc' }))
export const swr = createSwr(client)
```

Pass `{ prefix: 'user' }` when two utils trees would otherwise share keys.

## Data fetching

```ts
import useSWR from 'swr'

const { data, error, isLoading } = useSWR(
  swr.planet.find.key({ input: { id: 123 } }),
  swr.planet.find.fetcher(),
)
```

SWR’s `error` is the thrown `PFError`. `error.code` still narrows declared errors; `isLocalFailure(error)` still detects status `0`. Fetchers do not wrap `asResult`.

Skip a request with a null key: `id ? swr.planet.find.key({ input: { id } }) : null`.

## Infinite queries

```ts
import useSWRInfinite from 'swr/infinite'

const { data, size, setSize } = useSWRInfinite(
  (index, previousPage) => {
    if (previousPage && !previousPage.nextCursor) {
      return null
    }
    return swr.planet.list.key({
      input: { cursor: previousPage?.nextCursor },
    })
  },
  swr.planet.list.fetcher(),
)
```

The fetcher reads `input` from the key, so each page can pass a different cursor.

## Mutations

```ts
import useSWRMutation from 'swr/mutation'

const { trigger, isMutating } = useSWRMutation(
  swr.planet.list.key(),
  swr.planet.create.mutator(),
)

trigger({ name: 'New Planet' })
```

The `useSWRMutation` key is the cache entry to revalidate (often a list). `trigger` is the mutating procedure’s input.

## Manual revalidation

```ts
import { mutate } from 'swr'

mutate(swr.matcher())
mutate(swr.planet.matcher())
mutate(
  swr.planet.find.matcher({ input: { id: 123 }, strategy: 'exact' }),
)
```

Default matcher strategy is `'partial'` (path prefix + nested input subset).

## Subscriptions

For procedures whose output is `AsyncIterable` (typically `stream()`):

```ts
import useSWRSubscription from 'swr/subscription'

const { data, error } = useSWRSubscription(
  swr.planet.describe.key({ input: { id: 3 } }),
  swr.planet.describe.subscriber({ maxChunks: 10 }),
)
```

`liveSubscriber()` keeps the latest event instead of an array. Unsubscribe aborts the call via `CallOptions.signal`.

## Calling clients

The procedure utils object is callable, and `.call` is the underlying client:

```ts
const planet = await swr.planet.find({ id: 123 })
const same = await swr.planet.find.call({ id: 123 })
```

## Not in this package

- TanStack Query
- GET vs POST / client operation context
- Wrapping `useSWR` as `swr.planet.find.useSWR(input)`
- Retry (userland interceptors)
- React components or an `SWRConfig` provider
