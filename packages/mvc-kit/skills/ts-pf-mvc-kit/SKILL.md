---
name: ts-pf-mvc-kit
description: "Use when binding a ts-pf client to mvc-kit Resources with bindClient or issuesToFieldErrors. Triggers: @ts-pf/mvc-kit, bindClient, DisposeSignalHost, issuesToFieldErrors."
---

# @ts-pf/mvc-kit

Opt-in mvc-kit helpers for a ts-pf **client**. You still write Resource methods. Requires **mvc-kit >= 4.9.0**.

Install: `npm i @ts-pf/mvc-kit`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts no-check
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

`bindClient` injects `{ signal: host.disposeSignal }` at call time. A caller-provided `{ signal }` wins. Resource methods **throw** `PFError` (`errorCode === 'NOT_FOUND'`, not `'not_found'`). mvc-kit needs a numeric `status` to classify by `code`; `bindClient` supplies `400` when the transport does not carry one (message links, mid-stream failures, declared errors without `status`), so `errorCode` is the `PFError.code` on every `Link`. `asResult` without rethrow leaves `async.method.error` null.

`issuesToFieldErrors` keys each issue by the first segment of its path, since `FormModel` knows only top-level fields (`['address', 'city']` → `address`; first issue per field wins). For a nested object or array row with its own `FormModel`, pass `{ at: ['address'] }` or `{ at: ['items', i] }` to keep only the issues under that path, keyed relative to it. Give each form only keys it has as fields: an error on a key with no field keeps the form invalid, with nothing shown, until `clearErrors()` / `commit()` / `reset()`. Drop sub-form keys from the parent's errors (`const { address, ...own } = issuesToFieldErrors(issues)`).

## API

- `bindClient`, `DisposeSignalHost`
- `issuesToFieldErrors(issues, { at? })`, `IssuesToFieldErrorsOptions`

## Pair with

- Client: `ts-pf-client`
- Generated `Contract`: `ts-pf-codegen`
- Retry: `RetryPlugin` on `createClient`

## Don't

- Wrap Resource / `useLocal` / `useSingleton`.
- Throw `error.toJSON()` or wrap `PFError` in `HttpError` / `CodedError`.
- Map `NOT_FOUND` → `'not_found'`.
- `bindClient` the offline-kit outbox path — the outbox owns the signal.
