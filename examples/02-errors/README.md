# 02 — errors

Declared procedure errors, `asResult` narrowing, and undeclared codes via `PFError`.

**Packages:** `@ts-pf/contract`, `@ts-pf/server`, `@ts-pf/client`, `@ts-pf/protocol`

## Run

```sh
pnpm --filter @ts-pf/example-02-errors demo
```

Default port `3102`.

Expected:

```
find { id: 1, name: 'Earth' }
missing 999
locked UNAUTHORIZED
```

Thrown `PFError`s still reject the promise. `asResult` turns that into `{ ok: false, error }` so you can switch on `error.code`. HTTP status is transport-only — it is not in the JSON envelope.

Do not treat every `INTERNAL` as one UX bucket. `isLocalFailure(error)` is `status === 0`: the call never got a ts-pf response (offline, DNS, connection refused, abort). `code === 'INTERNAL'` with a non-zero status is a server bug (`FetchHandler` maps unknown throws to 500 and does not leak stacks). Declared codes (`NOT_FOUND`) are the procedure’s domain errors.

```ts
import { asResult, isLocalFailure } from '@ts-pf/client'

const result = await asResult(client.planet.find({ id: 1 }))
if (!result.ok) {
  if (isLocalFailure(result.error)) {
    // never reached the server — check error.cause; abort message is "Request aborted"
  } else if (result.error.code === 'NOT_FOUND') {
    result.error.data.id
  } else if (result.error.code === 'INTERNAL') {
    // server ran; do not show error.message to users
  }
}
```

Do not redeclare protocol codes (`VALIDATION`, `INTERNAL`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`) on `.errors()`.

## Look at

- `src/contract.ts` — `.errors({ NOT_FOUND: { status: 404, data } })`
- `src/app.ts` — `throw errors.NOT_FOUND({ id })` vs `throw new PFError({ code: 'UNAUTHORIZED' })`
- `src/client.ts` — `asResult` + `result.error.code === 'NOT_FOUND'` narrows `data`

Next: [03-middleware](../03-middleware)
