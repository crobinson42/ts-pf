import { asResult } from '@ts-pf/client'
import type { ContractClient, ValidationIssue } from '@ts-pf/contract'
import { procedure, router } from '@ts-pf/contract'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { bindClient } from '../src/bind-client.js'

const contract = router({
  planet: {
    list: procedure.output(
      z.array(z.object({ id: z.number(), name: z.string() })),
    ),
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
    create: procedure
      .input(z.object({ name: z.string() }))
      .output(z.object({ id: z.number(), name: z.string() })),
  },
})

describe('bindClient types', () => {
  type Bound = ReturnType<typeof bindClient<typeof contract>>

  it('returns ContractClient and keeps procedure signatures', () => {
    expectTypeOf(bindClient<typeof contract>).returns.toEqualTypeOf<
      ContractClient<typeof contract>
    >()
    expectTypeOf<Bound['planet']['list']>().parameters.toEqualTypeOf<
      [{ signal?: AbortSignal }?]
    >()
    expectTypeOf<Bound['planet']['find']>().parameters.toEqualTypeOf<
      [{ id: number }, { signal?: AbortSignal }?]
    >()
  })

  it('keeps asResult narrowing on the bound client', () => {
    async function sample(rpc: Bound) {
      const result = await asResult(rpc.planet.find({ id: 1 }))
      if (!result.ok && result.error.code === 'NOT_FOUND') {
        expectTypeOf(result.error.data).toEqualTypeOf<{ id: number }>()
      }
      if (!result.ok && result.error.code === 'VALIDATION') {
        expectTypeOf(result.error.data.issues).toEqualTypeOf<
          ValidationIssue[]
        >()
      }
    }
    expectTypeOf(sample).toBeFunction()
  })
})
