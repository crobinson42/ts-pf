# @ts-pf/mvc-kit

Opt-in [mvc-kit](https://www.npmjs.com/package/mvc-kit) helpers for a ts-pf **client**. Inject `disposeSignal` on every call and map `VALIDATION` issues onto `FormModel.setErrors` — you still write Resource methods and still call `useLocal` / `useSingleton` yourself.

This package does **not** wrap Resource, add React hooks, generate a Service, or fold into `@ts-pf/client`. Pass the client from `createClient<typeof contract>(link)` or `createClient<Contract>(link)` with a generated `Contract` from [`@ts-pf/codegen`](../codegen). Requires **mvc-kit >= 4.9.0**.

## Setup

```ts
import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import { bindClient, issuesToFieldErrors } from '@ts-pf/mvc-kit'
import { Resource, type DedupeConfig } from 'mvc-kit'
import type { InferContractInputs, InferContractOutputs } from '@ts-pf/contract'
import type { contract } from './contract'

export const client = createClient<typeof contract>(new FetchLink({ url: '/rpc' }))
type Planet = InferContractOutputs<typeof contract>['planet']['find']

class PlanetsResource extends Resource<Planet> {
  static DEDUPE: DedupeConfig<PlanetsResource> = {
    loadAll: true,
    loadById: (id) => id,
  }

  private rpc = bindClient(client, this)

  protected onInit() {
    if (this.length === 0) this.loadAll()
  }

  async loadAll() {
    this.reset(await this.rpc.planet.list())
  }

  async loadById(id: number) {
    this.upsert(await this.rpc.planet.find({ id }))
  }

  async create(input: InferContractInputs<typeof contract>['planet']['create']) {
    const row = await this.rpc.planet.create(input)
    this.add(row)
    return row
  }
}
```

`createClient` / `FetchLink` stay yours: Fetch interceptors, codec, and headers on `FetchLink`; call plugins (`RetryPlugin`, …) on `createClient`. `bindClient` only injects `{ signal: host.disposeSignal }` at **call time**. A caller-provided `{ signal }` wins.

App tsconfigs should use `moduleResolution: "bundler"` (Vite’s default) or `"nodenext"` when subclassing mvc-kit `Resource`. `Node16` does not inherit Resource members onto subclasses.

## Errors

Resource methods **throw**. mvc-kit classifies the thrown `PFError` as-is:

```ts
resource.async.loadById.errorCode === 'NOT_FOUND' // not 'not_found'
resource.async.loadById.cause // the PFError; .data is on the instance
```

Do not wrap `PFError` in `CodedError` or `HttpError`. `PFError` already has `code` and numeric `status`. `CodedError` is mvc-kit’s class if **you** throw by hand without that envelope.

Do not throw `error.toJSON()` — the JSON object has no `status`, so 4.9 will classify it as `'unknown'`.

## asResult in ViewModels

`asResult` is for ViewModel branching (forms). Async tracking keys off **throw**. If a Resource method `asResult`s and does not rethrow, `async.method.error` stays null.

```ts
import { asResult } from '@ts-pf/client'
import { issuesToFieldErrors } from '@ts-pf/mvc-kit'

const result = await asResult(this.rpc.planet.create(input))
if (!result.ok && result.error.code === 'VALIDATION') {
  this.form.setErrors(issuesToFieldErrors(result.error.data.issues))
  // rethrow if you also want vm.async.submit.errorCode === 'VALIDATION'
}
```

## Abort

Pass nothing. `bindClient` injects `host.disposeSignal`. Dispose/unmount aborts the in-flight call. FetchLink maps abort to `PFError { code: 'INTERNAL', local: true, status: 0, cause: AbortError }`. mvc-kit walks `cause` one level and **swallows** it — no error flash.

For Pending / offline-kit, pass the provided signal so it wins:

```ts
this.pending.enqueue(id, 'create', (signal) =>
  this.rpc.planet.create(input, { signal }).then((row) => {
    this.add(row)
  }),
)
```

Do not pass `this.disposeSignal` into Pending’s `execute`. Do not list Pending writes in `static DEDUPE` (joined reads must close over the host signal, which is the default).

## Feed recipe

No helper in v1. Feed owns the cursor; Resource upserts rows:

```ts
const page = await this.rpc.planet.listPage({ cursor: this.feed.cursor })
this.planets.upsert(...page.items)
this.feed.setResult(page)
```

## Streams, SSE, files

Same contracts, opt-in codec on the link you already own:

```ts
import { StreamCodec } from '@ts-pf/stream'

const client = createClient<typeof contract>(
  new FetchLink({ url: '/rpc', codec: new StreamCodec() }),
)

const items = await this.rpc.planet.describe({ id })
for await (const item of items) {
  this.upsert(item)
}
```

Cancel is the injected signal. There is no Stream→Feed helper.

`Channel` is a reconnecting inbound event bus. It is not RPC-over-WebSocket (`@ts-pf/message-client` `WsLink`) and not `SseCodec` (POST that streams then ends).

## offline-kit

One line; do not `bindClient` that path — the outbox owns the signal:

```ts
send: (entry, signal) => client.todo.create(entry.payload, { signal })
```

Entity `id` is `string`. Procedure-shaped non-CRUD writes do not belong there.

## Not in this package

- TanStack Query / `queryOptions` / query keys
- `createResources` / `fromProcedure` (one procedure is not a Resource)
- Pass-through Service (call the client from the Resource)
- Wrapping `useLocal` / `useSingleton`
- Channel / WsLink wrapper
- Retry (`RetryPlugin` on `createClient`)
- Mapping `NOT_FOUND` → `'not_found'`
- `instanceof HttpError` for RPC
- Walking `app` instead of the contract
