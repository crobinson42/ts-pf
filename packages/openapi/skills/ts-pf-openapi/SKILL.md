---
name: ts-pf-openapi
description: "Use when projecting a ts-pf catalog() to OpenAPI 3.1 with openapi(). Triggers: @ts-pf/openapi, openapi(), OpenAPI 3.1, POST JSON RPC spec, profile: 'codegen', openapi-generator / Kiota / orval / swagger_parser, discriminator, x-ts-pf-streams."
---

# @ts-pf/openapi

OpenAPI 3.1 projection of `catalog()`. POST JSON RPC only. Not a runtime.

Install: `npm i @ts-pf/openapi`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { procedure } from '@ts-pf/contract'
import { catalog, docs } from '@ts-pf/docs'
import { openapi } from '@ts-pf/openapi'

procedure.meta(docs({ description: 'Find a planet by id' }))

const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
  info: { title: 'Planet API', version: '1.0.0' },
})
```

Every path is `POST {prefix}/{router keys}`. Serve JSON in userland (`GET /openapi.json`), not from `FetchHandler`. Point Scalar/Swagger at that URL — do not embed those UIs here.

Typed split-repo clients: `ts-pf-codegen`, not OpenAPI-TS.

## Component names and schema normalizations

Same schemas as the catalog, normalized for code generators:

- No nested `$schema` (the document's `jsonSchemaDialect` declares it).
- Output and error `data` schemas are open (no `additionalProperties: false`). Inputs and the `{ ok, … }` envelopes are unchanged.
- Root `$defs` / `definitions` are hoisted (every key except `__schemaN` is an id): `.meta({ id: 'Book' })` → `components.schemas.Book`, one component across procedures. `<path>.Input` / `<path>.Output` stay; a bare named type is a `$ref` to it.
- Input shape differs from output (a field with a default, or a closed object such as `z.strictObject`, since inputs stay closed) → output `Book`, input `BookInput`. One side only or the same shape → `Book`. Two shapes for one id on the same side, a taken `<id>Input`, or an id equal to another component name throws: give one schema a distinct `.meta({ id })`.
- Zod's unnamed recursion (any def key `__schemaN`) → `<host>.__schemaN`, shared only when side and shape are identical; give it an id for a stable name.
- Declared errors: one `Error.<CODE>` (+ `Error.<CODE>.Data`) when every procedure's `data` shape matches (or none), including a code only one procedure declares; else `<path>.Error.<CODE>` per procedure. Protocol errors: `TsPf.Error.<CODE>` (+ `TsPf.Error.VALIDATION.Data`).

Post-processing by component name? Use these names; older versions emitted `<path>.Error.<CODE>` and `$defs` under each procedure component.

## Codegen profile (non-TypeScript generators)

For openapi-generator, Kiota, orval, or swagger_parser, pass `profile: 'codegen'` instead of writing a post-processor. It is still POST JSON RPC (no GET, path params, or REST):

```ts
import { catalog } from '@ts-pf/docs'
import { openapi } from '@ts-pf/openapi'

const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
  info: { title: 'Planet API', version: '1.0.0' },
  profile: 'codegen',
})
```

It sets these options (each settable alone; an explicit option beats the profile, e.g. `{ profile: 'codegen', naming: 'path' }` or `{ profile: 'codegen', hoist: 'none' }`):

- `envelopes: 'inline'` (default `'components'`): envelopes inline in each operation (no `<path>.Request` / `<path>.Success` components).
- `errors: 'shared'` (default `'per-code'`): one `RpcError`, an `ErrorCode` enum, `<Code>Data` per code with data (`NotFoundData`; protocol `ValidationErrorData`), `x-ts-pf-errors: [codes]` per operation. Nothing `$ref`s `<Code>Data`: map it by name from `error.code`. Throws when one code has two `data` shapes: declare one shape per code or rename one.
- `naming: 'pascal'` (default `'path'`): `AuthVerifyCodeInput` / `…Output`; a bare id input / output uses the id. Two schemas with one name throw: give one a distinct `.meta({ id })`.
- `closeInputs: true`: `additionalProperties: false` on input-only objects (stricter than the server, which strips unknown keys).
- `constAsEnum: 'exceptTags'`: `const` → one-value `enum`, except union tag properties.
- `dropFormatPatterns: true`: drop `pattern` next to a standard `format`.
- `emptyInputNull: true`: no input or a `null` input → inline `{ input: null }` body, no `Input` component.
- `hoist: 'objects'` (default `'none'`): nested inline objects with properties (under `properties`, `items`, record values, union variants; not tuple or `allOf` members) → a component named parent + path (`BookFindOutputAuthor`; array items `…Item`, record values `…Value`, union variants by tag value else `…Option1`; dotted under `naming: 'path'`). Identical shapes share one component (alphabetically first name). Envelopes keep their inline objects. Warns once listing the made-up names: give those objects `.meta({ id })`. One name for two shapes, or a name that is already a component, throws.
- `discriminators: true`: `discriminator: { propertyName, mapping }` on a `oneOf` / `anyOf` of component `$ref`s that each require a different string `const` (or one-value `enum`) on one property. Anything else is left alone.
- `canonical: true`: keys sorted at every depth (`canonicalize` from `@ts-pf/docs`), byte-stable output; `paths` and components become alphabetical.

Pass order (each sees the previous result): `naming` → `enumNames` → `closeInputs` → `dropFormatPatterns` → `constAsEnum` → `hoist` → `discriminators` → `canonical`.

Never set by the profile:

- `streams` (default `'operation'`): `'components'` gives stream procedures no path and lists their `<path>.Input` / `<path>.Output` components in `x-ts-pf-streams: { "<catalog key>": { input?, inputItem?, item?, output?, errors } }`; `'omit'` drops them like a catalog filter. The catalog cannot tell message-only streams from HTTP ones, so this is your call: use `'components'` when the streams are served over a message transport. Pair it with `errors: 'shared'` so every code's data has a `<Code>Data` component.
- `enumNames: { BookStatus: ['available', 'loaned'] }`: every inline `enum` with that value set (any order) → `$ref` to `BookStatus`. Prefer `.meta({ id })`. Unused entries warn; an invalid name, an entry with no values, two entries with one value set, or a name an existing component has with a different schema throws.
- `catalogHash`: written to `info['x-ts-pf-catalog-hash']`; pass `catalogHash(cat)` from `@ts-pf/codegen`.

`x-ts-pf-errors`, `x-ts-pf-streams`, and `x-ts-pf-catalog-hash` are the only `x-` extensions.

Security schemes and extra components stay userland: mutate the returned document.

## Documenting a GET bridge or REST facade

`openapi()` stays POST only. If you serve the userland GET bridge (`ts-pf-server-http`, "Cacheable reads"), add the `get` operations to the returned document yourself. Each opted-in catalog entry carries its contract meta, and the GET reuses the POST's responses:

```ts
import { catalog } from '@ts-pf/docs'
import { openapi } from '@ts-pf/openapi'
import { contract } from './contract.js'

const cat = catalog(contract, { prefix: '/rpc' })
const spec = openapi(cat, { info: { title: 'Planet API', version: '1.0.0' } })

for (const proc of cat.procedures) {
  const http = proc.meta.http as { method?: string } | undefined
  const item = proc.href === undefined ? undefined : spec.paths[proc.href]
  if (http?.method !== 'GET' || !item?.post) continue
  // `content` (a JSON-encoded parameter) is OpenAPI 3.1, wider than `PathItem`'s type.
  Object.assign(item, {
    get: {
      operationId: `${item.post.operationId}Get`,
      parameters: [{
        name: 'input',
        in: 'query',
        content: {
          // The hoisted input component (its $refs resolve in this document).
          'application/json': {
            schema:
              proc.input === undefined
                ? {}
                : { $ref: `#/components/schemas/${item.post.operationId}.Input` },
          },
        },
      }],
      responses: item.post.responses,
    },
  })
}
```

The snippet assumes the default `naming: 'path'` (under `profile: 'codegen'` the input is `<Path>Input`, or absent with `emptyInputNull`).

A REST facade has its own paths and bodies, so it documents them by hand (or with your REST framework's generator). Reference the components `openapi()` already emitted (`#/components/schemas/<id>`, `<id>Input` for request bodies when the id split, `<path>.Input`, `<path>.Output`) instead of redeclaring them.

## API

- `openapi`
- `OpenAPIOptions` (`sse: true` / `multipart: true` advertise those content types; `profile: 'codegen'` and its options `envelopes`, `errors`, `naming`, `closeInputs`, `constAsEnum`, `dropFormatPatterns`, `emptyInputNull`, `hoist`, `discriminators`, `canonical`; also `streams`, `enumNames`, `catalogHash`), `OpenAPIDocument`

## Pair with

- Catalog: `ts-pf-docs`
- Typed client `.d.ts`: `ts-pf-codegen`

## Don't

- GET/PUT/path params or flattened REST bodies from `openapi()` itself. Post-process the document in userland.
- Serve the spec from `FetchHandler`.
- Paths for message transports (not HTTP) in this document. Their stream schemas go in `x-ts-pf-streams` with `streams: 'components'`.
