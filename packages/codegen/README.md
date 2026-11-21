# @ts-pf/codegen

Print a nested `Contract` `.d.ts` from a `@ts-pf/docs` `catalog()`, and diff two catalogs for breaking changes. The frontend uses today's `createClient<Contract>(link)` — no second runtime, no `as typeof contract`, no `tsc --dts` of the backend.

Agent skill: [`skills/ts-pf-codegen/`](skills/ts-pf-codegen/). Sync with `npx skills experimental_sync -y`. Runnable split-repo app: [`examples/codegen`](../../examples/codegen).

Types never come from `fetch()` or `JSON.parse` casts. The catalog is the spec; the `.d.ts` is the TypeScript contract.

```ts
import { catalog } from '@ts-pf/docs'
import { emit } from '@ts-pf/codegen'
import { writeFileSync } from 'node:fs'

const spec = catalog(contract, { prefix: '/rpc' })
writeFileSync('catalog.json', JSON.stringify(spec, null, 2))
writeFileSync('contract.d.ts', emit(spec))
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

## `emit` / `catalogHash`

```ts
import { catalog } from '@ts-pf/docs'
import { emit, catalogHash, type EmitOptions } from '@ts-pf/codegen'

const spec = catalog(contract, { prefix: '/rpc' })
emit(spec, {
  name: 'Contract', // default
  failOnUnavailable: false, // default; true throws on kind: 'unavailable'
  banner: true, // role: entry, catalogVersion, sha256 hash
})

catalogHash(spec) // 'sha256:<hex>' of canonical JSON
```

Generated procedures are `ContractProcedure<I, O, E>`, where `I` is the input schema's input type (catalog `io: 'input'`), the same caller type a builder contract gives, with Phantom Standard Schema leaves so `InferErrorData` / `asResult` still narrow `error.code === 'NOT_FOUND'`. Protocol errors stay out of the generated error map (`ClientError` already unions them). No-input is `void`. Streams are `AsyncIterable<Item>`.

`docs()` on a procedure becomes JSDoc on that generated member (`description`, `summary`, `@deprecated`). Tags stay OpenAPI grouping; other `.meta()` keys are not printed. JSDoc is on `Contract` members — `ContractClient` is a mapped type, so hover on `client.planet.find` may not show it.

Runtime policy (cache vs write, auth, …) stays on the catalog. Ship `catalog.json` next to `contract.d.ts` and look up `procedures[].meta` by path. `createClient<Contract>` is still type-only.

The generated file uses `import type { ContractProcedure } from '@ts-pf/contract'`. This package does not import contract at runtime.

## `emitFiles`

For a large catalog, `emitFiles` prints the same `Contract` as one entry file plus a file per group and procedure. `createClient<Contract>` is unchanged. `emit()` stays the one-file default.

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { catalog } from '@ts-pf/docs'
import { emitFiles } from '@ts-pf/codegen'

const spec = catalog(contract, { prefix: '/rpc' })
for (const file of emitFiles(spec)) {
  const path = join('src/generated', file.path)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, file.contents)
}
```

```ts
import type { Contract } from './src/generated/contract.js'
```

`contract.d.ts` is the entry (`export type Contract`). A group file is an index (`planet.d.ts` exports `Planet` and points each member at a file). A procedure file is the spec (`planet.find.d.ts` exports `PlanetFind`, `PlanetFindInput`, `PlanetFindOutput`, and `PlanetFindErrors` when the procedure declares errors). `_phantom.d.ts` is added only when some error has `data`. Open the group to see the scope. Open one procedure file for that endpoint. The catalog hash is on the entry only.

Each split file's header starts with `role:` (`entry`, `group`, `procedure`, or `phantom`). A group file names its contract `path:`, `exports:`, and `parent:` file. A procedure file names `path:`, `call:` (`client.planet.find(input)`), `exports:` (including `Errors` only when the procedure declares errors), and `group:` when it is nested. A `docs()` summary, or description when there is no summary, is one collapsed `summary:` line (capped at 120 characters). The full JSDoc stays on the type. `_phantom.d.ts` is marked internal. The hash stays on the entry.

Paths are flat. A segment outside `[A-Za-z0-9_]` is UTF-8 percent-encoded, so a key `planet.find` and a path `planet` / `find` do not share a filename. The output directory is owned by codegen: `--out-dir` deletes stale `.d.ts` files and refuses to run if any other file is already there.

## CLI

```
ts-pf-codegen emit <catalog.json|-> [-o contract.d.ts | --out-dir <dir>] [--name Contract] [--fail-on-unavailable]
ts-pf-codegen pull <url> [-o contract.d.ts | --out-dir <dir>] [--lock catalog.lock.json]
ts-pf-codegen hash <catalog.json|->
ts-pf-codegen diff <previous.json> <next.json> [--json]
ts-pf-codegen --help
```

`emit`, `hash`, and `diff` read stdin when a path is `-`. Omit `-o` and `--out-dir` to write the single `.d.ts` to stdout. `-o` and `--out-dir` together is an error. `--help` / `-h` print usage and exit 0; no command prints usage to stderr and exits 1. Run it as `npx ts-pf-codegen …` or from an npm script — the bin resolves through the `node_modules/.bin` symlink.

Commit `contract.d.ts`, or CI-run `ts-pf-codegen pull` and pin `catalog.lock.json`:

```json
{
  "url": "https://api.example.com/catalog.json",
  "catalogVersion": 1,
  "catalogHash": "sha256:…"
}
```

Mismatch on pull exits non-zero. No registry in v1.

## Breaking-change check

Commit `catalog.json` (written from `catalog(contract)`, as in the first snippet). In CI, write the current catalog to a second file and diff the two:

```sh
npx ts-pf-codegen diff catalog.json catalog.next.json
```

`diff` prints breaking and safe changes. It exits `2` when there is a breaking change, `0` otherwise, and `1` on a usage, read, or parse error (including a file that is not a `catalog()` document). `--json` prints the `CatalogDiff` instead (same exit codes). One path may be `-` for stdin.

Or call it from the script that writes the catalog:

```ts
import { readFileSync } from 'node:fs'
import { type CatalogDiff, diffCatalog } from '@ts-pf/codegen'
import { catalog, type ProcedureCatalog } from '@ts-pf/docs'

const previous = JSON.parse(
  readFileSync('catalog.json', 'utf8'),
) as ProcedureCatalog
const diff: CatalogDiff = diffCatalog(
  previous,
  catalog(contract, { prefix: '/rpc' }),
)
for (const change of diff.breaking) {
  console.error(`${change.path ?? '(catalog)'} ${change.message}`)
}
if (diff.breaking.length > 0) process.exitCode = 2
```

`path` is the procedure key (`planet/find`); it is absent for a catalog-level change (`pointer: '/protocol/version'`). `pointer` is the location inside that entry: `/input` or `/output` (plus `/item` for a stream item) or `/errors/<code>/data`, then the JSON Schema path (`/input/properties/id`); also `/errors/<code>`, `/errors/<code>/status`, and `/docs/deprecated`. Errors are addressed by code (JSON-pointer escaped), not array index. `kind` names the rule (`procedure-removed`, `required-property-added`, `type-changed`, …). Changes are plain JSON.

Direction decides. Inputs are what an old client **sends**; outputs and error `data` are what it **receives**.

| Breaking                                                                                                                                   | Safe                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| procedure removed (a rename is removed + added)                                                                                            | procedure added                                                       |
| unary ↔ stream, for input or output                                                                                                        | `docs({ deprecated: true })` added (reported)                         |
| `protocol.version` changed                                                                                                                 |                                                                       |
| input: required property added; optional → required                                                                                        | input: optional property added; required → optional                   |
| input: property removed from a closed object (`additionalProperties: false`)                                                               | input: property removed from an open object                           |
| input: type narrowed (`number` → `integer`, `string` → enum, enum value or union variant removed, `null` dropped, tighter `min*` / `max*`) | input: type widened (the reverse)                                     |
| input: object closed; input schema added where there was none                                                                              | input: schema removed                                                 |
| output: required property removed; required → optional                                                                                     | output: property added; optional property removed                     |
| output: type changed or widened (`string` → `number`, `integer` → `number`, enum → `string`, now `null`, looser `min*` / `max*`)           | output: enum value or union variant added or removed; type narrowed   |
| output / error `data` schema removed                                                                                                       | output / error `data` schema added                                    |
|                                                                                                                                            | new error code; error code removed; error `status` changed (reported) |

Error `data` is compared like output. Union variants match by a shared `const` tag (`z.discriminatedUnion`), else by equal schema; a lone unmatched variant on each side of an untagged union is compared as the same variant. Local `$ref`s resolve through `$defs` / `definitions`, so a change to a shared DTO is reported at every place that uses it.

The check is conservative where it can reason and quiet where it cannot. Docs text (`description`, `title`, `examples`, `default`) and `format` are ignored. A keyword it does not model (`pattern`, `prefixItems` tuples, `allOf`, `not`, …) is reported as a safe `unknown-change`, never as breaking. Catalog fields outside the schemas are not compared: `prefix`, `href`, `meta` (other than `docs().deprecated`), `protocol.header`, `protocolErrors`, and error `message`. A schema that becomes `kind: 'unavailable'` (or available again) is reported as safe and not compared. It does not prove two schemas are compatible; it flags the changes that are known to break old clients.

## Serve the catalog in userland

Do **not** put this on `FetchHandler`. A GET under `/rpc/...` is a procedure miss / `METHOD_NOT_ALLOWED`, not a spec.

```ts no-check
// Userland — not FetchHandler, not @ts-pf/codegen:
if (url.pathname === '/catalog.json') {
  return Response.json(catalog(contract, { prefix: '/rpc' }))
}
const result = await handler.handle(req, { prefix: '/rpc', context })
```

## API

- `emit`, `emitFiles`, `catalogHash`, `diffCatalog`
- `EmitOptions`, `EmitFile`, `CatalogDiff`, `CatalogChange`
- CLI `ts-pf-codegen` (not exported from `"."`)

## Not in this package

- `createClientFromCatalog`
- Folding into `@ts-pf/client` or `@ts-pf/docs`
- OpenAPI-TS as the typed client (use `@ts-pf/openapi` for the polyglot export)
- Type-level `FromSchema` over imported JSON
- `tsc --dts` of the live router
- Serving catalog from FetchHandler
- Auth on `pull` (later)
- A schema registry

The catalog is the portable spec. [`@ts-pf/openapi`](../openapi) remains the polyglot OpenAPI 3.1 export.
