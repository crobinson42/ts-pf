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

Message transports (WebSocket, stdio, MessagePort) are not HTTP and are not in this document.

Typed split-repo clients: [`@ts-pf/codegen`](../codegen).

## API

- `openapi`
- `OpenAPIOptions` (`sse: true` / `multipart: true` advertise those content types), `OpenAPIDocument`
