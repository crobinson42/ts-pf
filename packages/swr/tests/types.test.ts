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
    search: procedure
      .input(z.object({ q: z.string(), limit: z.number().default(10) }))
      .output(z.array(z.string())),
  },
})

describe('SwrClient types', () => {
  type Client = SwrClient<typeof contract>

  it('requires input on non-void key()', () => {
    expectTypeOf<Client['planet']['find']['key']>().parameters.toEqualTypeOf<
      [{ input: { id: number } }]
    >()
    expectTypeOf<Client['planet']['list']['key']>().parameters.toEqualTypeOf<
      [({ input?: undefined } | undefined)?]
    >()
  })

  it('types key() for a union input and an optional input', () => {
    const shapes = router({
      byRef: procedure.input(
        z.union([z.object({ id: z.number() }), z.object({ slug: z.string() })]),
      ),
      maybe: procedure.input(z.object({ id: z.number() }).optional()),
    })
    // Type-checked only; never called.
    const _calls = (utils: SwrClient<typeof shapes>) => {
      utils.byRef.key({ input: { id: 1 } })
      utils.byRef.key({ input: { slug: 'earth' } })
      // @ts-expect-error input fits neither branch
      utils.byRef.key({ input: { id: 'earth' } })
      utils.maybe.key()
      utils.maybe.key({ input: { id: 1 } })
    }
  })

  it('types key() input with the schema input (defaults optional)', () => {
    expectTypeOf<Client['planet']['search']['key']>().parameters.toEqualTypeOf<
      [{ input: { q: string; limit?: number | undefined } }]
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

describe('SwrClient with an expansion', () => {
  const Ref = z.object({ id: z.string(), email: z.string() })
  const expanding = router({
    posts: {
      get: procedure
        .input(
          z.object({
            id: z.string(),
            populate: z.array(z.enum(['authorId'])).optional(),
          }),
        )
        .output(
          z.object({ id: z.string(), authorId: z.union([z.string(), Ref]) }),
        )
        .expand({ key: 'populate', fields: { authorId: Ref } }),
    },
  })
  type Get = SwrClient<typeof expanding>['posts']['get']
  const get = {} as Get

  it('narrows the callable and call()', () => {
    // Type-only: never called.
    const _check = async () => {
      expectTypeOf((await get({ id: 'p' })).authorId).toEqualTypeOf<string>()
      expectTypeOf(
        (await get({ id: 'p', populate: ['authorId'] })).authorId,
      ).toEqualTypeOf<{ id: string; email: string }>()
      expectTypeOf(
        (await get.call({ id: 'p', populate: ['authorId'] })).authorId,
      ).toEqualTypeOf<{ id: string; email: string }>()
    }
  })

  it('fetcher() gives the wide output', () => {
    expectTypeOf<
      Awaited<ReturnType<ReturnType<Get['fetcher']>>>['authorId']
    >().toEqualTypeOf<string | { id: string; email: string }>()
  })
})
