---
name: ts-pf-contract
description: Use when defining a ts-pf contract with procedure, router, schemas, typed errors, or InferContract* types. Triggers: @ts-pf/contract, procedure, router, registerSchemaAdapter, ClientError, .errors(), .input(), .output().
---

# @ts-pf/contract

Contract builders and infer types. No HTTP, no runtime.

Install: `npm i @ts-pf/contract@beta`

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

Schemas: Standard Schema (Zod, Valibot, ArkType) or TypeBox. More via `registerSchemaAdapter`. `.output()` is optional (`unknown` if omitted). `.input()` once.

## API

- `procedure`, `router`, `registerSchemaAdapter`, `validateSchema`
- `isContractProcedure`, `isContractRouter`
- `ClientError`, `ContractClient`, `CallOptions`
- `InferContractInputs`, `InferContractOutputs`, `InferContractErrors`, `InferErrorData`

## Pair with

- Implement: `ts-pf-server`
- Call: `ts-pf-client`
- Descriptions on `.meta()`: `ts-pf-docs` (`docs()`)

## Don't

- HTTP, `FetchHandler`, or codecs here.
- `.docs()` on the builder — use `docs()` from `@ts-pf/docs` inside `.meta()`.
- Stacked `.input()` merge/pipe. oRPC `oc`.
- Redeclare `VALIDATION`, `INTERNAL`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, or `PAYLOAD_TOO_LARGE` on `.errors()`.
