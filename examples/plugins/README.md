# plugins

Call interceptors and `CallPlugin`s on `createClient` / `FetchHandler`, plus a custom plugin on each side. HTTP `HandlerPlugin`s (`CORSPlugin`) stay on `FetchHandler.plugins` — a different list. Timeout is userland (`AbortSignal.timeout` wrapped as `TimeoutPlugin` here); it is not a first-party plugin.

```ts
import {
  CachePlugin,
  createClient,
  DedupePlugin,
  onStart,
  RetryPlugin,
} from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import { TimeoutPlugin } from './timeout-plugin'

const client = createClient(new FetchLink({ url: '/rpc' }), {
  plugins: [
    new TimeoutPlugin(5_000),
    new CachePlugin({ ttl: 5_000, key: readKey }),
    new DedupePlugin({ key: readKey }),
    new RetryPlugin({ retries: 2 }),
  ],
  interceptors: [onStart(({ path }) => console.log(path.join('.')))],
})
```

```ts
import { applyPlugins, DedupePlugin } from '@ts-pf/server'
import { CORSPlugin, FetchHandler } from '@ts-pf/server-http'

new FetchHandler(app, {
  plugins: [new CORSPlugin({ origin: '*' })],
  interceptors: applyPlugins([new DedupePlugin({ key: readKey }), audit]),
})
```

`CallPlugin` is `{ name, intercept }`. Array order only — `[0]` is outermost. `next` may replace `input` / `signal` (and on the server, `context`); it cannot change `path`. Pass `key` so cache/dedupe skip writes. Server `DedupePlugin` buckets by the context object `handle()` received — share that object (a db/app handle) if overlapping HTTP reads should join.
