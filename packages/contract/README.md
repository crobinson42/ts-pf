# @ts-pf/contract

`procedure` / `router`, schema adapters, nested routers, typed errors, and infer types for [ts-pf](https://github.com/crobinson42/ts-pf#readme). The contract is the one file both server and client import. No HTTP, no runtime.

## Install

```sh
npm i @ts-pf/contract @ts-pf/server @ts-pf/server-http @ts-pf/client @ts-pf/client-http zod
```

Schemas are any [Standard Schema](https://standardschema.dev/) library (Zod, Valibot, ArkType) or TypeBox; `zod` above is one choice.

## Define

```ts
// contract.ts
import { procedure, router } from '@ts-pf/contract'
import { z } from 'zod'

const planet = z.object({ id: z.number(), name: z.string() })

export const contract = router({
  planet: {
    list: procedure.output(z.array(planet)),
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(planet)
      .errors({ NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) } }),
    create: procedure.input(z.object({ name: z.string() })).output(planet),
  },
})
```

`.input()` once, `.output()` optional (`unknown` if omitted), `.errors()` declares typed failures the handler throws and the client narrows on. Nest slices with `router({ planet: planetContract, star: starContract })`.

## Use it on both sides

```ts
import { createImplementer } from '@ts-pf/server'
import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { ContractClient } from '@ts-pf/contract'
import { contract } from './contract.js'

// Server (@ts-pf/server): every procedure must be implemented — missing or
// extra keys are a type error.
const planets = [{ id: 1, name: 'Earth' }]
const impl = createImplementer(contract)
export const app = impl.router({
  planet: {
    list: impl.planet.list.handler(async () => planets),
    find: impl.planet.find.handler(async ({ input, errors }) => {
      const row = planets.find((p) => p.id === input.id)
      if (!row) throw errors.NOT_FOUND({ id: input.id })
      return row
    }),
    create: impl.planet.create.handler(async ({ input }) => {
      const row = { id: planets.length + 1, name: input.name }
      planets.push(row)
      return row
    }),
  },
})

// Client (@ts-pf/client): imports the contract *type* only, never server code.
export const client: ContractClient<typeof contract> = createClient(
  new FetchLink({ url: '/rpc' }),
)
```

Serving `app` over HTTP (`FetchHandler`) and the rest of the happy path: [root README](https://github.com/crobinson42/ts-pf#readme).

## API

- `procedure`, `router`, `registerSchemaAdapter`, `validateSchema`
- `isContractProcedure`, `isContractRouter`
- `ClientError`, `ContractClient`, `CallOptions`
- `InferContractInputs`, `InferContractOutputs`, `InferContractErrors`, `InferErrorData`
- `InferContractProcedure<T>` (type) — `{ input, output, errors, meta }` of one procedure type, or `never`; `IsContractProcedure<T>` (type) — `true` / `false`. For tooling that walks a contract type (a builder or a codegen `ContractProcedure`) without re-deriving the match.
- `ContractProtocolErrorCode` (type) — the closed protocol codes `ClientError` falls back to

## Agent skills

This package ships [`ts-pf-contract`](https://github.com/crobinson42/ts-pf/blob/main/packages/contract/skills/ts-pf-contract/SKILL.md) and the hub catalog [`ts-pf-app`](https://github.com/crobinson42/ts-pf/blob/main/packages/contract/skills/ts-pf-app/SKILL.md) (Fetch happy path plus opt-in capabilities). Sync with `npx skills experimental_sync -y`.
