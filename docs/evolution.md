# Evolving a contract

How to change a contract that clients already use without breaking them: which changes are safe, which are breaking, how old clients see what you add, and how to catch a breaking change in review. The wire protocol has its own version (see [Wire version vs contract version](#wire-version-vs-contract-version)); this page is about your procedures.

Servers and clients rarely ship at the same moment: a browser tab keeps an old bundle, a mobile app stays on an old build, a worker in another repo pins an old `contract.d.ts`. Assume the server deploys first. A change is **safe** when a client built against the old contract keeps working against the new server.

## Safe changes

| Change | Why an old client keeps working |
|---|---|
| Add a procedure | Old clients never call it. |
| Add an optional input field | Old clients omit it. Make it `.optional()`, or `.default(x)` so the handler always gets a value. |
| Add an output field | Old clients ignore keys they do not know (see [Open outputs, closed inputs](#open-outputs-closed-inputs)). |
| Add an enum value or union variant to an output | Safe on the wire, as long as old clients [tolerate unknown values](#unknown-enum-values-and-union-variants). |
| Add an error code | Safe on the wire, as long as old clients [keep a catch-all branch](#unknown-error-codes). |

The last two are only as safe as the client code that reads them. Write clients so they are.

## Breaking changes

| Change | What an old client sees |
|---|---|
| Rename or remove a procedure | `NOT_FOUND` (`Procedure not found`) on every call, with no `data`. If the procedure declared its own `NOT_FOUND` with `data`, the old client's types still promise that `data` (see the example [below](#unknown-error-codes)). |
| Add a required input field, or make an optional one required | `VALIDATION` on every call that omits it. |
| Rename an input field | `VALIDATION` if the new name is required; otherwise the old key is stripped and its value silently ignored. |
| Remove an input field | The call succeeds, but the value the client sent is stripped and ignored. Breaking whenever it mattered. |
| Narrow an input type (drop an enum value, `string` → enum, tighter `min` / `max`) | `VALIDATION` on calls that used to pass. Widening and then narrowing back breaks every client that started sending the wider values. |
| Remove an output field, or make it optional or nullable | `undefined` / `null` where the client's type promises a value. |
| Change an output field's type | A value of the wrong type, with no error until the client uses it. |
| Rename or remove an error code | The client's branch for it never matches again; the failure falls into the catch-all. |
| Change what a code means, or its `data` shape | The client's branch matches and does the wrong thing, or reads `data` that is not there. |
| Switch a procedure between unary and stream | The result changes shape (a value vs an `AsyncIterable`), and the response framing with it. |

A breaking change ships as a new procedure next to the old one, or in a release that updates every client together (see [Wire version vs contract version](#wire-version-vs-contract-version)).

## How old clients see new things

### Unknown error codes

A TypeScript client's `ClientError` union is exactly the procedure's declared codes plus the protocol codes, with no string catch-all ([Errors](errors.md#declared-errors)). A code the server added after the client was built still arrives at runtime, but it is not in the client's type. Switch on `error.code` and always keep a branch that handles any code:

```ts
import { asResult } from '@ts-pf/client'

declare function showMissing(id: number | undefined): void
declare function showError(message: string): void

const result = await asResult(client.planet.find({ id: 1 }))
if (!result.ok) {
  switch (result.error.code) {
    case 'NOT_FOUND':
      // Also the protocol NOT_FOUND (no `data`) if this procedure is ever removed.
      showMissing(result.error.data?.id)
      break
    default:
      // Every other code, including codes added after this client was built.
      showError(result.error.message)
  }
}
```

Do not end that `switch` with an exhaustiveness helper that throws (`assertNever(error)`): it type-checks today and turns tomorrow's new server code into a client crash.

### Unknown enum values and union variants

The same holds for outputs. A client's types list the enum values and union variants it was built with; the TypeScript client does not validate outputs, so a value added later arrives as is. Give every `switch` over an output enum or discriminant a `default` branch. If the client parses responses with its own schema, keep that schema lenient for fields that can grow (`z.string()` rather than the closed enum, or `.catch()` to a fallback), so a new value is not a parse error.

### Clients in other languages

The same rules apply to any HTTP client: switch on `error.code` and treat an unknown code as a generic failure (the protocol requires a catch-all: see [Protocol errors](../packages/protocol/PROTOCOL.md#protocol-errors)), ignore unknown object keys, and accept enum strings you do not recognise.

The [HTTP and WebSocket client checklists](../packages/protocol/PROTOCOL.md#http-client-checklist) in `PROTOCOL.md` list everything such a client must handle, and the [conformance fixtures](../packages/protocol/conformance/README.md) let it prove it.

## Prefer a discriminated union over widening an enum

When a new case carries its own data, a new enum value plus an optional field next to it lets clients build states that make no sense (`archived` with a `mergedInto`). A discriminated union keeps each case's data with its tag, and an old client still lands in its `default` branch for a tag it does not know:

```ts
import { procedure } from '@ts-pf/contract'
import { z } from 'zod'

const PlanetState = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('active') }),
  z.object({ kind: z.literal('archived'), archivedAt: z.string() }),
  // Added later. Old clients see an unknown `kind` and take their default branch.
  z.object({ kind: z.literal('merged'), mergedInto: z.number() }),
])

export const find = procedure
  .input(z.object({ id: z.number() }))
  .output(z.object({ id: z.number(), name: z.string(), state: PlanetState }))
```

Turning an existing enum field into a union is itself a breaking change, so start with the union for a field you expect to grow cases with data.

## Open outputs, closed inputs

**Inputs.** Input checks run by default, and a Zod `z.object` strips keys its schema does not list before the handler runs. A field the server does not know yet (a newer client against an older server) is dropped silently, which is one more reason to deploy the server first. `z.strictObject` rejects unknown keys with `VALIDATION` instead: louder, but a client that is ahead of the server then fails.

**Outputs.** Clients should treat outputs as open: ignore keys they do not know and never reject a response for having them. That is what makes "add an output field" safe. On the server, output checks are off by default, so whatever the handler returns is sent; with `validation: { output: true }` the schema's parsing applies (a Zod object strips undeclared keys). A catalog or OpenAPI document may mark output objects `additionalProperties: false` (Zod's JSON Schema does). That describes what this server version sends, not a promise that the next one will not add a field, so configure generated clients in other languages to allow extra output fields.

## Deprecating a procedure

Add the replacement next to the old procedure, mark the old one deprecated, and keep it until its clients have moved:

```ts
import { procedure, router } from '@ts-pf/contract'
import { docs } from '@ts-pf/docs'
import { z } from 'zod'

const Planet = z.object({ id: z.number(), name: z.string() })

export const contract = router({
  planet: {
    list: procedure
      .meta(docs({ deprecated: true, description: 'Use planet.search.' }))
      .output(z.array(Planet)),
    search: procedure
      .input(z.object({ query: z.string().optional(), cursor: z.string().optional() }))
      .output(z.object({ items: z.array(Planet), next: z.string().optional() })),
  },
})
```

`docs({ deprecated: true })` from `@ts-pf/docs` is metadata only: the procedure still runs. It reaches the catalog (`procedure.docs.deprecated`), the OpenAPI operation (`deprecated: true`), and the JSDoc `@ts-pf/codegen` emits (`@deprecated`, so editors strike the call through). Say what to use instead in the `description`. A server call interceptor that counts calls per `path` tells you when the old procedure has stopped being called; removing it is then a breaking change only for the clients you already moved.

## Error maps: shared or per procedure

`.errors(map)` sets a procedure's whole map (a second call replaces it), and every map is a plain object. That leaves two shapes:

- **Every code on every procedure.** One list, nothing to forget, and a client branch on any code type-checks everywhere. The cost: each procedure's `ClientError` union lists codes it can never return, so the client type no longer tells you what can actually fail; the catalog, the OpenAPI responses, and the per-procedure error type `@ts-pf/codegen` emits (`PlanetFindErrors`) say the same thing for every procedure; and adding a code touches the whole API surface.
- **Exactly the codes each procedure can return.** Precise types and docs, but a code that shared middleware throws must be repeated on every procedure it guards. An undeclared code still reaches the client, outside its type and, over HTTP, with status 400 unless the error carries one.

A good middle ground is a base set for what shared middleware can throw anywhere, plus additions per area:

```ts
import { type ErrorMap, procedure, router } from '@ts-pf/contract'
import { z } from 'zod'

// Codes shared middleware can throw on any procedure.
const baseErrors = {
  UNAUTHORIZED: { status: 401 },
  RATE_LIMITED: { status: 429, message: 'Too many requests' },
} satisfies ErrorMap

const planetErrors = {
  NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
} satisfies ErrorMap

const Planet = z.object({ id: z.number(), name: z.string() })

export const contract = router({
  planet: {
    list: procedure.output(z.array(Planet)).errors(baseErrors),
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(Planet)
      .errors({ ...baseErrors, ...planetErrors }),
  },
})
```

`satisfies ErrorMap` checks each entry and keeps the literal keys and `data` schemas, so the spread map types the handler's `errors` factory and the client's `ClientError` exactly as an inline map would. To derive the map from a domain layer's own error catalog, see [A domain error catalog](../packages/server/README.md#a-domain-error-catalog) in the `@ts-pf/server` README.

## Checking for breaking changes

The contract is code, so review it like a public API: keep a generated description of it in the repository and read its diff on every change.

```ts
// scripts/write-catalog.ts — run in CI, then fail on `git diff --exit-code catalog.json`
import { writeFileSync } from 'node:fs'
import { catalog } from '@ts-pf/docs'
import { contract } from './contract.js'

// `filter: () => true` keeps docs({ hidden: true }) procedures in the baseline too.
const spec = catalog(contract, { prefix: '/rpc', filter: () => true })
writeFileSync('catalog.json', `${JSON.stringify(spec, null, 2)}\n`)
```

`catalog.json` then lists every procedure with its input and output JSON Schema, its declared errors, and its `docs()` metadata, so a diff shows a removed procedure, a new required input field, or a dropped error code directly; check it against the tables above. An OpenAPI document from `@ts-pf/openapi` works the same way if that is what your reviewers read. `catalogHash(spec)` from `@ts-pf/codegen` is a stable hash of the catalog: it tells you (or a client that pinned it with `ts-pf-codegen pull --lock`) that something changed, not what.

To fail CI on a breaking change automatically, commit `catalog.json` as the baseline and run `ts-pf-codegen diff catalog.json next.json` from `@ts-pf/codegen` against the freshly generated one: it exits `2` when a change is breaking under the rules on this page (inputs are what old clients send; outputs and error `data` are what they receive) and lists safe changes too. See [Breaking-change check](../packages/codegen/README.md#breaking-change-check).

## Wire version vs contract version

The `x-ts-pf-protocol` header (and `v` on the message `hello`) carries ts-pf's wire major. It changes only when ts-pf's own envelope changes ([Versioning](../packages/protocol/PROTOCOL.md#versioning)), never because your contract did, and it is not your API version. ts-pf has no API-version field: a breaking contract change ships either as new procedures next to the old ones, or as a coordinated release of the server and every client.

New procedures can be a sibling (`planet.search` next to `planet.list`) or a whole `v2` slice nested under the same contract, served at `/rpc/v2/...` by the same handler:

```ts
import { router } from '@ts-pf/contract'

declare const planetV2Contract: typeof planetContract

export const contract = router({
  planet: planetContract,
  v2: { planet: planetV2Contract },
})
```

The implementation nests the same way (`impl.router({ planet: planetApp, v2: { planet: planetV2App } })`), and the old slice stays until its clients have moved. A coordinated release fits when one team ships the server and all of its clients together; old browser tabs and cached bundles still call the previous contract for a while, so keep that window in mind.
