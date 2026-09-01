import {
  type InferContractInputs,
  type InferContractOutputs,
  oc,
} from '@ts-pf/contract'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

describe('contract infer types', () => {
  it('infers input and output from schemas', () => {
    const find = oc
      .input(z.object({ id: z.number() }))
      .output(z.object({ name: z.string() }))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      })

    type Inputs = InferContractInputs<{ find: typeof find }>
    expectTypeOf<Inputs['find']>().toEqualTypeOf<{ id: number }>()

    type Outputs = InferContractOutputs<{ find: typeof find }>
    expectTypeOf<Outputs['find']>().toEqualTypeOf<{ name: string }>()
  })

  it('defaults omitted output to unknown and omitted input to void', () => {
    const noOut = oc.input(z.object({ id: z.number() }))
    expectTypeOf<
      InferContractOutputs<{ x: typeof noOut }>['x']
    >().toEqualTypeOf<unknown>()

    const noIn = oc.output(z.string())
    expectTypeOf<
      InferContractInputs<{ x: typeof noIn }>['x']
    >().toEqualTypeOf<void>()
  })
})
