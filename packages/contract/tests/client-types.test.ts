import { type ContractClient, oc } from '@ts-pf/contract'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

describe('ContractClient', () => {
  it('is assignable from the contract shape', () => {
    const contract = oc.router({
      planet: {
        find: oc
          .input(z.object({ id: z.number() }))
          .output(z.object({ name: z.string() })),
        list: oc.output(z.array(z.string())),
      },
    })

    type Client = ContractClient<typeof contract>
    expectTypeOf<Client['planet']['find']>().parameters.toEqualTypeOf<
      [{ id: number }]
    >()
    expectTypeOf<Client['planet']['list']>().parameters.toEqualTypeOf<[]>()
  })
})
