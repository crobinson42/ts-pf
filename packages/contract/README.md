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

`.input()` once, `.output()` optional (`unknown` if omitted), `.errors()` declares typed failures the handler throws and the client narrows on. Callers send the input schema's input type (a `.default()` field is optional, a `.transform()` takes its source type); the handler receives the parsed output type. Nest slices with `router({ planet: planetContract, star: starContract })`.

## Expandable outputs

When a read takes a list of fields to expand (`populate`, `expand`, `include`), `.expand()` makes the output type follow that list on every client: `createClient`, `createLocalClient`, `@ts-pf/swr`, `@ts-pf/mvc-kit`, `@ts-pf/astro`, and codegen output.

```ts
import { type ContractClient, procedure, router } from '@ts-pf/contract'
import { z } from 'zod'

const User = z.object({ id: z.string(), name: z.string() })
const Post = z.object({
  id: z.string(),
  authorId: z.union([z.string(), User]), // wide: either form
})
const Populate = z.array(z.enum(['authorId'])).optional()

export const posts = router({
  get: procedure
    .input(z.object({ id: z.string(), populate: Populate }))
    .output(Post)
    .expand({ key: 'populate', fields: { authorId: User } }),
  find: procedure
    .input(z.object({ populate: Populate }))
    .output(z.object({ docs: z.array(Post) }))
    .expand({ key: 'populate', at: ['docs'], fields: { authorId: User } }),
})

declare const client: ContractClient<typeof posts>

const plain = await client.get({ id: 'p1' })
plain.authorId // string
const post = await client.get({ id: 'p1', populate: ['authorId'] })
post.authorId // { id: string; name: string }
const page = await client.find({ populate: ['authorId'] })
page.docs[0]?.authorId // { id: string; name: string } | undefined
// @ts-expect-error Type '"title"' is not assignable to type '"authorId"'
await client.get({ id: 'p1', populate: ['title'] })
```

- `.output()` is the **wide** schema, which is what the server may send. The server, output validation, OpenAPI, and MCP all use it. `fields` are the expanded schemas, so a field's plain type is its wide type minus its expanded type.
- A field whose plain type is only `undefined` (an optional `categories?: Link[]`) is present only when expanded: it is left out without the list and becomes required with it. Expanding a nullable or optional ref keeps `null` / `undefined`.
- `at` is the key path to the expandable object (arrays and `null` pass through). Omit it for the root.
- The input schema must declare `key` as an array that accepts every field name. `.expand()` comes after `.input()` and `.output()`, once, with at least one field. A mismatch is a type error that reads `expand: …`.
- A literal list narrows. A list held in a `K[]` variable returns the wide output, because it could hold any subset.
- No wire change: the list is an ordinary input field, and the handler returns the wide output.

Hand-written contract types write the sixth `ContractProcedure` parameter with `Expansion<Key, At, Fields>`. `Fields` holds the expanded **output types**, not schemas:

```ts
import type { ContractProcedure, Expansion } from '@ts-pf/contract'

type User = { id: string; name: string }
type GetInput = { id: string; populate?: 'authorId'[] }
type PostWide = { id: string; authorId: string | User }

export type Get = ContractProcedure<
  GetInput, // what the caller sends
  PostWide, // the wide output
  {}, // errors
  {}, // meta
  GetInput, // what the handler receives
  Expansion<'populate', [], { authorId: User }>
>
```

`InferExpandedOutput<typeof contract.posts.get, ['authorId']>` names the narrowed type wherever a call does not produce it. `InferContractOutputs` and `InferContractProcedure['output']` give the wide output.

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
- `toValidationIssues(issues)` — Standard Schema issues → `ValidationIssue[]` (the `VALIDATION` `data.issues` shape: `{ key }` path segments unwrapped, numbers kept, other keys as strings), the same normalization the built-in adapter applies; pair with `validationError` from `@ts-pf/server` in a handler that validates itself
- `isContractProcedure`, `isContractRouter`
- `ClientError`, `ContractClient`, `CallOptions`
- `InferContractInputs`, `InferContractOutputs`, `InferContractErrors`, `InferErrorData`
- `InferContractProcedure<T>` (type) — `{ input, parsedInput, output, errors, meta, expand }` of one procedure type, or `never` (`input` is what a caller sends, `parsedInput` what the handler receives; a codegen `ContractProcedure<I, O>` has both as `I`; `expand` is its `Expansion` or `never`); `IsContractProcedure<T>` (type) — `true` / `false`. For tooling that walks a contract type (a builder or a codegen `ContractProcedure`) without re-deriving the match.
- `ContractProtocolErrorCode` (type) — the closed protocol codes `ClientError` falls back to
- `.expand({ key, at?, fields })`, `Expansion<Key, At, Fields>` (type: the hand-writable 6th `ContractProcedure` parameter; `Fields` are output types), `InferExpandedOutput<T, P>` (type: the output a call passing the tuple `P` returns), `ContractExpandDef` (type: the runtime `~pf.expand` record): see [Expandable outputs](#expandable-outputs)

## Agent skills

This package ships [`ts-pf-contract`](https://github.com/crobinson42/ts-pf/blob/main/packages/contract/skills/ts-pf-contract/SKILL.md) and the hub catalog [`ts-pf-app`](https://github.com/crobinson42/ts-pf/blob/main/packages/contract/skills/ts-pf-app/SKILL.md) (Fetch happy path plus opt-in capabilities). Sync with `npx skills experimental_sync -y`.
