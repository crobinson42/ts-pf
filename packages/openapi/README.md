# @ts-pf/openapi

Project a `@ts-pf/docs` `catalog()` into an **OpenAPI 3.1** document that describes the existing POST JSON RPC.

Agent skill: [`skills/ts-pf-openapi/`](skills/ts-pf-openapi/). Sync with `npx skills experimental_sync -y`.

The catalog is the portable spec. This package is the **polyglot** export. For a TypeScript client in another repo, use [`@ts-pf/codegen`](../codegen) (`emit` → `createClient<Contract>`), not OpenAPI-TS.

This package does **not** serve HTTP, embed Scalar/Swagger, invent REST paths, or change `FetchHandler`. Path params, GET/PUT, and flattened bodies are out.

```ts
import { procedure } from '@ts-pf/contract'
import { catalog, docs } from '@ts-pf/docs'
import { openapi } from '@ts-pf/openapi'

procedure.meta(docs({ description: 'Find a planet by id' }))

const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
  info: { title: 'Planet API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
})
```

Every path is `POST {prefix}/{router keys}` with body `{ "input": … }` and `{ "ok": true, "output": … }` / `{ "ok": false, "error": { "code", "message", "data?" } }`. The protocol header comes from `catalog.protocol`.

Serve the JSON in userland, **outside** the RPC prefix (`GET /rpc/...` is not a spec):

```ts no-check
if (url.pathname === '/openapi.json') {
  return Response.json(spec)
}
const result = await handler.handle(req, { prefix: '/rpc', context })
```

Point Scalar or Swagger UI at that URL. Do not put those UIs in this package.

`openapi()` is a projection of the catalog (its schemas are normalized, see below). Filter/hide procedures with `catalog(..., { filter })`. Mutate the returned object for `security`, extra `components`, or operation overrides.

Stream procedures advertise `application/jsonl` (item schema from the catalog). Pass `sse: true` to also list `text/event-stream`. Pass `multipart: true` to also list `multipart/form-data` on unary requests. Default is JSON (and JSONL for streams).

### Schemas and component names

The document describes the same schemas the catalog holds. It normalizes them so code generators (openapi-generator, Kiota, orval, swagger_parser) get one model per type:

- **No nested `$schema`.** The document's `jsonSchemaDialect` declares JSON Schema 2020-12 once.
- **Outputs are open.** `additionalProperties: false` is dropped from output and error `data` schemas, so a server that adds a field does not break older generated clients. Input schemas stay as the catalog gives them. The `{ ok, output }` / `{ ok, error }` envelopes stay closed (the protocol defines them).
- **`$defs` are hoisted.** Every root `$defs` / `definitions` key other than `__schema<N>` (see below) is treated as an id: a Zod `.meta({ id: 'Book' })`, a TypeBox `Cyclic` key, or another converter's def name becomes `components.schemas.Book`, and every `$ref` points there. A DTO used by several procedures is one component. Each procedure keeps its `<path>.Input` / `<path>.Output` component; when the schema is just a named type, that component is a `$ref` to it (`book.find.Output` → `Book`).
- **Input and output shapes of one id.** An id used on one side only, or with the same shape on both, is `<id>`. When the shapes differ, the output keeps `<id>` and the input becomes `<id>Input`. Typical causes: a field with a default (required in the output, optional in the input), or a closed object (`z.strictObject`, `additionalProperties: false`), because inputs stay closed while outputs open. A type that contains a split type splits too.
- **Collisions throw.** Two different shapes for one id on the same side, an `<id>Input` that is already an id, or an id that equals another component name throws an `Error` naming the id (or, for a name clash, the component). Give one of the schemas a distinct `.meta({ id })`. Ids are sanitized to `[A-Za-z0-9._-]`.
- **Unnamed recursion is named after its host.** Zod names an unnamed recursive schema `__schemaN` in each conversion, so the same key means different schemas in different procedures. Any def key matching `__schema<N>` is therefore not an id: it becomes `<host>.__schemaN` (for example `book.reviews.Output.__schema0`), shared across procedures only when side and shape are identical (named after the first host that resolves it). Give the schema a `.meta({ id })` for a stable name.
- **Errors are shared per code.** When every procedure that declares a code has the same `data` shape (or none), there is one `Error.<CODE>` envelope and one `Error.<CODE>.Data`. That includes a code only one procedure declares. When the data differs, every procedure that declares the code keeps its own `<path>.Error.<CODE>` (and `.Data`). Each response keeps its procedure's status and message. Protocol errors are `TsPf.Error.<CODE>` (and `TsPf.Error.VALIDATION.Data`).

`$anchor` / `$dynamicAnchor` across schemas are not rewritten, and only root `$defs` / `definitions` are hoisted. If you post-process the document by component name, use these names.

### Codegen profile

The default document is a plain projection that reads well in Scalar. Code generators (openapi-generator, Kiota, orval, swagger_parser) want a few more choices made for them. `profile: 'codegen'` makes them:

```ts
import { catalog } from '@ts-pf/docs'
import { openapi } from '@ts-pf/openapi'

const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
  info: { title: 'Planet API', version: '1.0.0' },
  profile: 'codegen',
})
```

The profile describes the same POST JSON RPC paths and envelopes: no GET, no path params, no REST. It sets the options below. Each one can also be set alone, and an option you pass yourself wins over the profile (`{ profile: 'codegen', naming: 'path' }` keeps dotted names).

| Option | Default | `codegen` | Effect |
| --- | --- | --- | --- |
| `envelopes` | `'components'` | `'inline'` | Request / success envelopes inline in each operation: no `<path>.Request` / `<path>.Success` components. |
| `errors` | `'per-code'` | `'shared'` | One `RpcError` envelope (`{ ok: false, error: { code: ErrorCode, message, data? } }`), an `ErrorCode` string enum (every code an operation can return), one `<Code>Data` per code with data (`NOT_FOUND` → `NotFoundData`; protocol `VALIDATION` → `ValidationErrorData`), and `x-ts-pf-errors: [codes]` on each operation. Error responses `$ref` `RpcError`. Nothing `$ref`s a `<Code>Data` component: map it by name from `error.code` (or `x-ts-pf-errors`). Throws when two procedures declare one code with different `data` shapes; a procedure that declares the code without data is fine. |
| `naming` | `'path'` | `'pascal'` | `auth.verifyCode.Input` → `AuthVerifyCodeInput` (`…Output`, `…Request`, `…Success`; `book.reviews.Output.__schema0` → `BookReviewsOutputSchema0`; with `errors: 'per-code'`, `Error.NOT_FOUND` → `NotFoundError`, `TsPf.Error.VALIDATION` → `TsPfValidationError`, `<path>.Error.<CODE>` → `<Path><Code>Error`, and `.Data` → `…Data`). Ids keep their names as given, and a procedure whose input or output is just an id uses the id (`BookFindOutput` is not emitted; the operation refs `Book`). Throws when two different schemas get one name: give one a distinct `.meta({ id })`. |
| `closeInputs` | `false` | `true` | `additionalProperties: false` on objects that only requests reach. This is stricter than the server, which strips unknown keys. A component a response (or error data) also reaches stays open, and so do `allOf` members and objects that combine subschemas (`allOf` / `anyOf` / `oneOf`). |
| `constAsEnum` | `false` | `'exceptTags'` | `const: v` → `enum: [v]`, except on the tag property of a union of objects (a property with a different `const` in every variant). |
| `dropFormatPatterns` | `false` | `true` | Drops `pattern` where a standard `format` (`date-time`, `email`, `uuid`, `uri`, …) is set. Zod emits both. Non-standard formats keep their pattern. |
| `emptyInputNull` | `false` | `true` | A procedure with no input, or a `null` input, gets an inline `{ input: null }` request body and no `Input` component. (`z.void()` / `z.undefined()` are `unavailable` in the catalog and are not detected; omit `.input()` instead.) |

More profile options follow in a later release.

App-specific parts of the document (security schemes, extra components, operation overrides) stay in userland: mutate the returned document, as with the default output.

Message transports (WebSocket, stdio, MessagePort) are not HTTP and are not in this document.

Typed split-repo clients: [`@ts-pf/codegen`](../codegen).

## API

- `openapi`
- `OpenAPIOptions` (`sse: true` / `multipart: true` advertise those content types; `profile: 'codegen'` and its options `envelopes`, `errors`, `naming`, `closeInputs`, `constAsEnum`, `dropFormatPatterns`, `emptyInputNull`), `OpenAPIDocument`
