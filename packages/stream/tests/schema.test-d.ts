import { type InferContractProcedure, procedure } from '@ts-pf/contract'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { stream } from '../src/schema.js'

describe('stream() item types', () => {
  const item = z.object({ chunk: z.number(), tag: z.string().default('x') })
  const upload = procedure.input(stream(item)).output(stream(item))
  type Upload = InferContractProcedure<typeof upload>

  it('the sender writes the item input type', () => {
    expectTypeOf<Upload['input']>().toEqualTypeOf<
      AsyncIterable<{ chunk: number; tag?: string | undefined }>
    >()
  })

  it('the handler reads parsed items and returns output items', () => {
    expectTypeOf<Upload['parsedInput']>().toEqualTypeOf<
      AsyncIterable<{ chunk: number; tag: string }>
    >()
    expectTypeOf<Upload['output']>().toEqualTypeOf<
      AsyncIterable<{ chunk: number; tag: string }>
    >()
  })
})
