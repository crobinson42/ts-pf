---
name: ts-pf-contract
description: "Use when defining a ts-pf contract with procedure, router, schemas, typed errors, or InferContract* types. Triggers: @ts-pf/contract, procedure, router, registerSchemaAdapter, toValidationIssues, ClientError, .errors(), .input(), .output()."
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

Nest slice routers: `router({ planet: planetContract, star: starContract })`. Pick a procedure into a smaller tree: `router({ list: users.list })`. No `mergeRouters`.

## API

- `procedure`, `router`, `registerSchemaAdapter`, `validateSchema`
- `toValidationIssues(issues)` — Standard Schema issues → `ValidationIssue[]` (the `VALIDATION` `data.issues` shape: `{ key }` path segments unwrapped, numbers kept, other keys as strings), the same normalization the built-in adapter applies; pair with `validationError` from `@ts-pf/server` in a handler that validates itself
- `isContractProcedure`, `isContractRouter`
- `ClientError`, `ContractClient`, `CallOptions`
- `InferContractInputs`, `InferContractOutputs`, `InferContractErrors`, `InferErrorData`
- `InferContractProcedure<T>` (type) — `{ input, parsedInput, output, errors, meta }` of one procedure type, or `never` (`input` is what a caller sends, `parsedInput` what the handler receives; a codegen `ContractProcedure<I, O>` has both as `I`); `IsContractProcedure<T>` (type) — `true` / `false`. For tooling that walks a contract type (a builder or a codegen `ContractProcedure`) without re-deriving the match.
- `ContractProtocolErrorCode` (type) — the closed protocol codes `ClientError` falls back to

## Pair with

- Implement: `ts-pf-server`
- Call: `ts-pf-client`
- Descriptions on `.meta()`: `ts-pf-docs` (`docs()`)

## Don't

- HTTP, `FetchHandler`, or codecs here.
- `.docs()` on the builder — use `docs()` from `@ts-pf/docs` inside `.meta()`.
- Stacked `.input()` merge/pipe. oRPC `oc`.
- `mergeRouters` — nest `router({ planet: planetContract })`.
- Redeclare `VALIDATION`, `INTERNAL`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, or `PAYLOAD_TOO_LARGE` on `.errors()`.
