import { procedure, router } from '@ts-pf/contract'
import {
  createImplementer,
  createLocalClient,
  lookupProcedure,
} from '@ts-pf/server'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

const planetContract = router({
  find: procedure
    .input(z.object({ id: z.number() }))
    .output(z.object({ id: z.number(), name: z.string() })),
})

const starContract = router({
  find: procedure
    .input(z.object({ id: z.number() }))
    .output(z.object({ id: z.number(), kind: z.string() })),
})

const authContract = router({
  me: procedure.output(z.object({ id: z.number() })),
})

type Ctx = { db: string }

describe('compose slice contracts and implementations', () => {
  it('nests branded slice contracts under a root router', async () => {
    const contract = router({
      planet: planetContract,
      star: starContract,
      auth: authContract,
    })

    const impl = createImplementer(contract).$context<Ctx>()
    const app = impl.router({
      planet: {
        find: impl.planet.find.handler(async ({ input }) => ({
          id: input.id,
          name: 'earth',
        })),
      },
      star: {
        find: impl.star.find.handler(async ({ input }) => ({
          id: input.id,
          kind: 'g',
        })),
      },
      auth: {
        me: impl.auth.me.handler(async () => ({ id: 1 })),
      },
    })

    const client = createLocalClient(app, { context: { db: 'x' } })
    expectTypeOf(client.planet.find)
      .parameter(0)
      .toEqualTypeOf<{ id: number }>()
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'earth',
    })
    expect(await client.star.find({ id: 2 })).toEqual({ id: 2, kind: 'g' })
    expect(await client.auth.me()).toEqual({ id: 1 })
  })

  it('nests independently implemented slice routers', async () => {
    const contract = router({
      planet: planetContract,
      star: starContract,
      auth: authContract,
    })

    const planetImpl = createImplementer(planetContract).$context<Ctx>()
    const planetApp = planetImpl.router({
      find: planetImpl.find.handler(async ({ input, path }) => ({
        id: input.id,
        name: path.join('.'),
      })),
    })

    const starImpl = createImplementer(starContract).$context<Ctx>()
    const starApp = starImpl.router({
      find: starImpl.find.handler(async ({ input }) => ({
        id: input.id,
        kind: 'g',
      })),
    })

    const authImpl = createImplementer(authContract).$context<Ctx>()
    const authApp = authImpl.router({
      me: authImpl.me.handler(async () => ({ id: 1 })),
    })

    const impl = createImplementer(contract).$context<Ctx>()
    const app = impl.router({
      planet: planetApp,
      star: starApp,
      auth: authApp,
    })

    const client = createLocalClient(app, { context: { db: 'x' } })
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'planet.find',
    })
    expect(lookupProcedure(app, ['planet', 'find'])?.['~pf'].path).toEqual([
      'planet',
      'find',
    ])
    expect(await client.star.find({ id: 2 })).toEqual({ id: 2, kind: 'g' })
    expect(await client.auth.me()).toEqual({ id: 1 })
  })

  it('nests child .router() results from a shared implementer', async () => {
    const contract = router({
      planet: planetContract,
      star: starContract,
      auth: authContract,
    })
    const impl = createImplementer(contract).$context<Ctx>()

    const planetApp = impl.planet.router({
      find: impl.planet.find.handler(async ({ input, path }) => ({
        id: input.id,
        name: path.join('.'),
      })),
    })
    const starApp = impl.star.router({
      find: impl.star.find.handler(async ({ input }) => ({
        id: input.id,
        kind: 'g',
      })),
    })
    const authApp = impl.auth.router({
      me: impl.auth.me.handler(async () => ({ id: 1 })),
    })

    const app = impl.router({
      planet: planetApp,
      star: starApp,
      auth: authApp,
    })

    const client = createLocalClient(app, { context: { db: 'x' } })
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'planet.find',
    })
  })

  it('prepends root middleware onto nested slice procedures', async () => {
    const contract = router({
      planet: planetContract,
    })
    const order: string[] = []

    const planetImpl = createImplementer(planetContract).$context<Ctx>()
    const sliceMw = planetImpl.middleware(async ({ next }) => {
      order.push('slice')
      return next()
    })
    const planetApp = planetImpl.use(sliceMw).router({
      find: planetImpl.find.handler(async ({ input }) => ({
        id: input.id,
        name: 'earth',
      })),
    })

    const impl = createImplementer(contract).$context<Ctx>()
    const rootMw = impl.middleware(async ({ next }) => {
      order.push('root')
      return next()
    })
    const app = impl.use(rootMw).router({
      planet: planetApp,
    })

    const client = createLocalClient(app, { context: { db: 'x' } })
    await client.planet.find({ id: 1 })
    expect(order).toEqual(['root', 'slice'])
  })

  it('picks implemented procedures into a smaller server contract', async () => {
    const usersContract = router({
      list: procedure.output(
        z.array(z.object({ id: z.number(), organizationId: z.number() })),
      ),
      listPopulated: procedure.output(
        z.array(
          z.object({
            id: z.number(),
            organization: z.object({ id: z.number(), name: z.string() }),
          }),
        ),
      ),
    })
    const usersImpl = createImplementer(usersContract).$context<Ctx>()
    const usersApp = usersImpl.router({
      list: usersImpl.list.handler(async () => [{ id: 1, organizationId: 9 }]),
      listPopulated: usersImpl.listPopulated.handler(async () => [
        { id: 1, organization: { id: 9, name: 'acme' } },
      ]),
    })

    const webContract = router({
      users: router({ list: usersContract.list }),
    })
    const webImpl = createImplementer(webContract).$context<Ctx>()
    const webApp = webImpl.router({
      users: { list: usersApp.list },
    })

    const mobileContract = router({
      users: router({ list: usersContract.listPopulated }),
    })
    const mobileImpl = createImplementer(mobileContract).$context<Ctx>()
    const mobileApp = mobileImpl.router({
      users: { list: usersApp.listPopulated },
    })

    const webClient = createLocalClient(webApp, { context: { db: 'x' } })
    const mobileClient = createLocalClient(mobileApp, { context: { db: 'x' } })
    expect(await webClient.users.list()).toEqual([{ id: 1, organizationId: 9 }])
    expect(await mobileClient.users.list()).toEqual([
      { id: 1, organization: { id: 9, name: 'acme' } },
    ])
    expectTypeOf(webClient.users.list).returns.resolves.toEqualTypeOf<
      { id: number; organizationId: number }[]
    >()
    expectTypeOf(mobileClient.users.list).returns.resolves.toEqualTypeOf<
      { id: number; organization: { id: number; name: string } }[]
    >()
  })
})
