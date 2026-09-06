import {
  type ClientError,
  type InferContractErrors,
  type InferContractInputs,
  type InferContractOutputs,
  procedure,
  router,
} from '@ts-pf/contract'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

describe('contract infer types', () => {
  it('infers input and output from schemas', () => {
    const find = procedure
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
    const noOut = procedure.input(z.object({ id: z.number() }))
    expectTypeOf<
      InferContractOutputs<{ x: typeof noOut }>['x']
    >().toEqualTypeOf<unknown>()

    const noIn = procedure.output(z.string())
    expectTypeOf<
      InferContractInputs<{ x: typeof noIn }>['x']
    >().toEqualTypeOf<void>()
  })

  it('ClientError narrows data from code', () => {
    const find = procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ name: z.string() }))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
        GONE: { status: 410 },
      })

    type Err = ClientError<(typeof find)['~pf']['errors']>

    const notFound = {
      code: 'NOT_FOUND' as const,
      status: 404,
      message: 'x',
      data: { id: 1 },
    }
    const gone = { code: 'GONE' as const, status: 410, message: 'x' }
    expectTypeOf(notFound).toExtend<Err>()
    expectTypeOf(gone).toExtend<Err>()

    function take(err: Err) {
      if (err.code === 'NOT_FOUND') {
        expectTypeOf(err.data).toEqualTypeOf<{ id: number }>()
      }
      if (err.code === 'GONE') {
        expectTypeOf(err.data).toEqualTypeOf<undefined>()
      }
      if (err.code === 'VALIDATION') {
        expectTypeOf(err.data).toEqualTypeOf<{
          issues: { message: string; path: Array<string | number> }[]
        }>()
      }
    }
    take(notFound)
  })

  it('infers nested branded slice routers', () => {
    const planet = router({
      find: procedure
        .input(z.object({ id: z.number() }))
        .output(z.object({ name: z.string() })),
    })
    const contract = router({ planet })
    expectTypeOf<
      InferContractInputs<typeof contract>['planet']['find']
    >().toEqualTypeOf<{ id: number }>()
    expectTypeOf<
      InferContractOutputs<typeof contract>['planet']['find']
    >().toEqualTypeOf<{ name: string }>()
  })

  it('InferContractErrors walks the router', () => {
    const contract = router({
      planet: {
        find: procedure
          .input(z.object({ id: z.number() }))
          .output(z.object({ name: z.string() }))
          .errors({
            NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
          }),
      },
    })
    type Errors = InferContractErrors<typeof contract>
    expectTypeOf<Errors['planet']['find']>().toMatchTypeOf<{
      code: 'NOT_FOUND'
      data: { id: number }
    }>()
  })
})
