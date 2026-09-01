import {
  type ClientError,
  type ContractClient,
  procedure,
  router,
} from '@ts-pf/contract'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

describe('ContractClient', () => {
  it('is assignable from the contract shape', () => {
    const contract = router({
      planet: {
        find: procedure
          .input(z.object({ id: z.number() }))
          .output(z.object({ name: z.string() })),
        list: procedure.output(z.array(z.string())),
      },
    })

    type Client = ContractClient<typeof contract>
    expectTypeOf<Client['planet']['find']>().parameters.toEqualTypeOf<
      [{ id: number }, { signal?: AbortSignal }?]
    >()
    expectTypeOf<Client['planet']['list']>().parameters.toEqualTypeOf<
      [{ signal?: AbortSignal }?]
    >()
  })

  it('overlays ClientError data from the procedure error map', () => {
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

    type Client = ContractClient<typeof contract>
    type FindError = NonNullable<
      ReturnType<Client['planet']['find']>['~pfError']
    >
    expectTypeOf<FindError>().toExtend<
      ClientError<(typeof contract.planet.find)['~pf']['errors']>
    >()

    function take(err: FindError) {
      if (err.code === 'NOT_FOUND') {
        expectTypeOf(err.data).toEqualTypeOf<{ id: number }>()
      }
    }
    take({
      code: 'NOT_FOUND',
      status: 404,
      message: 'missing',
      data: { id: 1 },
    })
  })
})
