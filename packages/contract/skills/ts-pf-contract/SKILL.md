---
name: ts-pf-contract
description: "Use when defining a ts-pf contract with procedure, router, schemas, typed errors, expandable outputs, or InferContract* types. Triggers: @ts-pf/contract, procedure, router, registerSchemaAdapter, toValidationIssues, ClientError, .errors(), .input(), .output(), .expand(), populate, Expansion, InferExpandedOutput."
---

# @ts-pf/contract

Contract builders and infer types. No HTTP, no runtime.

Install: `npm i @ts-pf/contract`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { procedure, router } from '@ts-pf/contract'
import { z } from 'zod'
import Type from 'typebox'

export const contract = router({
  planet: {
    list: procedure.output(z.array(z.object({ id: z.number(), name: z.string() }))),
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({ NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) } }),
    create: procedure
      .input(Type.Object({ name: Type.String() }))
      .output(Type.Object({ id: Type.Number(), name: Type.String() })),
  },
})
```

Schemas: Standard Schema (Zod, Valibot, ArkType) or TypeBox. More via `registerSchemaAdapter`. `.output()` is optional (`unknown` if omitted). `.input()` once. Callers send the input schema's input type (a `.default()` field is optional, a `.transform()` takes its source type); the handler receives the parsed output type.

`.errors()` `status` is optional HTTP / OpenAPI metadata (omitted → HTTP 400). `ClientError` carries `status?: number`: the HTTP response status over Fetch, `undefined` on message transports and mid-stream items. Narrow on `code`; guard `status`.

Expandable outputs, where a `populate` / `expand` list in the input picks which fields come back expanded: `.output()` gets the **wide** schema (each field in either form), and `.expand()` lists each field's expanded schema. Every client then narrows per call, with no wrapper type.

```ts
import { procedure } from '@ts-pf/contract'
import { z } from 'zod'

const User = z.object({ id: z.string(), name: z.string() })
export const get = procedure
  .input(z.object({ id: z.string(), populate: z.array(z.enum(['authorId'])).optional() }))
  .output(z.object({ id: z.string(), authorId: z.union([z.string(), User]) }))
  .expand({ key: 'populate', fields: { authorId: User } }) // add `at: ['docs']` for a page's items
// client.get({ id }) → authorId: string; client.get({ id, populate: ['authorId'] }) → authorId: User
```

The plain type is the wide type minus the expanded one. A field that is only `undefined` when plain (an optional list such as `categories?: Link[]`) exists only when expanded. A non-literal `K[]` list gives the wide output. A hand-written contract type writes `Expansion<'populate', ['docs'], { authorId: User }>` (output **types**) as the 6th `ContractProcedure` parameter.

Nest slice routers: `router({ planet: planetContract, star: starContract })`. Pick a procedure into a smaller tree: `router({ list: users.list })`. No `mergeRouters`.

## API

- `procedure`, `router`, `registerSchemaAdapter`, `validateSchema`
- `toValidationIssues(issues)` — Standard Schema issues → `ValidationIssue[]` (the `VALIDATION` `data.issues` shape: `{ key }` path segments unwrapped, numbers kept, other keys as strings), the same normalization the built-in adapter applies; pair with `validationError` from `@ts-pf/server` in a handler that validates itself
- `isContractProcedure`, `isContractRouter`
- `ClientError`, `ContractClient`, `CallOptions`
- `InferContractInputs`, `InferContractOutputs`, `InferContractErrors`, `InferErrorData`
- `InferContractProcedure<T>` (type) — `{ input, parsedInput, output, errors, meta, expand }` of one procedure type, or `never` (`input` is what a caller sends, `parsedInput` what the handler receives; a codegen `ContractProcedure<I, O>` has both as `I`; `expand` is its `Expansion` or `never`); `IsContractProcedure<T>` (type) — `true` / `false`. For tooling that walks a contract type (a builder or a codegen `ContractProcedure`) without re-deriving the match.
- `ContractProtocolErrorCode` (type) — the closed protocol codes `ClientError` falls back to
- `.expand({ key, at?, fields })`; `Expansion<Key, At, Fields>` (type, the 6th `ContractProcedure` parameter); `InferExpandedOutput<T, ['authorId']>` (type; `InferContractOutputs` gives the wide output); `ContractExpandDef` (type, `~pf.expand`)

## Pair with

- Implement: `ts-pf-server`
- Call: `ts-pf-client`
- Descriptions on `.meta()`: `ts-pf-docs` (`docs()`)

## Don't

- HTTP, `FetchHandler`, or codecs here.
- `.docs()` on the builder — use `docs()` from `@ts-pf/docs` inside `.meta()`.
- Stacked `.input()` merge/pipe. oRPC `oc`.
- `mergeRouters` — nest `router({ planet: planetContract })`.
- Separate `getPopulated` procedures, or a hand-written client type that is generic in `populate` — use `.expand()`. Do not give `.output()` the plain shape when the server may send expanded fields: the output must be the wide schema.
- Redeclare `VALIDATION`, `INTERNAL`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, or `PAYLOAD_TOO_LARGE` on `.errors()`.
