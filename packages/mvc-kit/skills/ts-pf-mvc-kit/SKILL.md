---
name: ts-pf-mvc-kit
description: Use when binding a ts-pf client to mvc-kit Resources with bindClient or issuesToFieldErrors. Triggers: @ts-pf/mvc-kit, bindClient, DisposeSignalHost, issuesToFieldErrors.
---

# @ts-pf/mvc-kit

Opt-in mvc-kit helpers for a ts-pf **client**. You still write Resource methods. Requires **mvc-kit >= 4.9.0**.

Install: `npm i @ts-pf/mvc-kit`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { bindClient, issuesToFieldErrors } from '@ts-pf/mvc-kit'
import { asResult } from '@ts-pf/client'
import { Resource } from 'mvc-kit'

class PlanetsResource extends Resource<Planet> {
  private rpc = bindClient(client, this)

  async loadById(id: number) {
    this.upsert(await this.rpc.planet.find({ id })) // throws PFError
  }
}

const result = await asResult(this.rpc.planet.create(input))
if (!result.ok && result.error.code === 'VALIDATION') {
  this.form.setErrors(issuesToFieldErrors(result.error.data.issues))
  // rethrow if you also want vm.async.submit.errorCode
}
```

`bindClient` injects `{ signal: host.disposeSignal }` at call time. A caller-provided `{ signal }` wins. Resource methods **throw** `PFError` (`errorCode === 'NOT_FOUND'`, not `'not_found'`). `asResult` without rethrow leaves `async.method.error` null.

## API

- `bindClient`, `DisposeSignalHost`
- `issuesToFieldErrors`

## Pair with

- Client: `ts-pf-client`
- Generated `Contract`: `ts-pf-codegen`
- Retry: `RetryPlugin` on `createClient`

## Don't

- Wrap Resource / `useLocal` / `useSingleton`.
- Throw `error.toJSON()` or wrap `PFError` in `HttpError` / `CodedError`.
- Map `NOT_FOUND` → `'not_found'`.
- `bindClient` the offline-kit outbox path — the outbox owns the signal.
