import { procedure, router } from '@ts-pf/contract'
import { stream } from '@ts-pf/stream'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { createSwr } from '../src/create-swr.js'
import type { SwrClient, SwrKey, SwrProcedureUtils } from '../src/types.js'

const contract = router({
  planet: {
    list: procedure.output(
      z.array(z.object({ id: z.number(), name: z.string() })),
    ),
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
    describe: procedure
      .input(z.object({ id: z.number() }))
      .output(stream(z.object({ token: z.string() }))),
  },
})

describe('SwrClient types', () => {
  type Client = SwrClient<typeof contract>

  it('requires input on non-void key()', () => {
    expectTypeOf<Client['planet']['find']['key']>().parameters.toEqualTypeOf<
      [{ input: { id: number } }]
    >()
    expectTypeOf<Client['planet']['list']['key']>().parameters.toEqualTypeOf<
      [{ input?: undefined }?]
    >()
  })

  it('types fetcher output from the procedure', () => {
    type Find = Client['planet']['find']
    expectTypeOf<Find['fetcher']>().returns.toEqualTypeOf<
      (key: SwrKey<{ id: number }>) => Promise<{ id: number; name: string }>
    >()
    expectTypeOf<Find>().toExtend<
      SwrProcedureUtils<{ id: number }, { id: number; name: string }, {}>
    >()
  })

  it('exposes subscriber only on AsyncIterable outputs', () => {
    expectTypeOf<Client['planet']['describe']['subscriber']>().toBeFunction()
    expectTypeOf<
      Client['planet']['describe']['liveSubscriber']
    >().toBeFunction()
    expectTypeOf<Client['planet']['find']>().not.toHaveProperty('subscriber')
    expectTypeOf<Client['planet']['list']>().not.toHaveProperty(
      'liveSubscriber',
    )
  })

  it('exposes matcher on routers but not fetcher', () => {
    expectTypeOf<Client['planet']['matcher']>().toBeFunction()
    expectTypeOf<Client['planet']>().not.toHaveProperty('fetcher')
    expectTypeOf<Client['matcher']>().toBeFunction()
  })

  it('createSwr returns SwrClient', () => {
    expectTypeOf(createSwr<typeof contract>).returns.toEqualTypeOf<
      SwrClient<typeof contract>
    >()
  })
})
