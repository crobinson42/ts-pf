import { procedure, router } from '@ts-pf/contract'
import {
  createImplementer,
  createLocalClient,
  type ImplementedProcedure,
  type ImplementedRouter,
} from '@ts-pf/server'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
        GONE: { status: 410 },
      }),
    create: procedure
      .input(z.object({ name: z.string() }))
      .output(z.object({ id: z.number() })),
  },
})

type Ctx = { db: string }

const impl = createImplementer(contract).$context<Ctx>()

const find = impl.planet.find.handler(async ({ input }) => ({
  id: input.id,
  name: 'earth',
}))
const create = impl.planet.create.handler(async () => ({ id: 1 }))

describe('handler typing', () => {
  it('types input, context, path, and signal', () => {
    impl.planet.find.handler(async ({ input, context, path, signal }) => {
      expectTypeOf(input).toEqualTypeOf<{ id: number }>()
      expectTypeOf(context).toEqualTypeOf<Ctx>()
      expectTypeOf(path).toEqualTypeOf<string[]>()
      expectTypeOf(signal).toEqualTypeOf<AbortSignal | undefined>()
      return { id: input.id, name: 'earth' }
    })
  })

  it('accepts sync or async returns of the output type', () => {
    impl.planet.find.handler(({ input }) => ({ id: input.id, name: 'earth' }))
    expectTypeOf(find).toEqualTypeOf<
      ImplementedProcedure<typeof contract.planet.find, Ctx>
    >()
  })

  it('brands the result with its contract procedure and context', () => {
    // Branded procedures are assignable to the unbranded default, so
    // `runProcedure`, `lookupProcedure`, and `CallInterceptor` keep working.
    expectTypeOf(find).toExtend<ImplementedProcedure>()
    expectTypeOf(find).toExtend<
      ImplementedProcedure<typeof contract.planet.find>
    >()
    expectTypeOf(find).not.toExtend<
      ImplementedProcedure<typeof contract.planet.create, Ctx>
    >()
    expectTypeOf(find).not.toExtend<
      ImplementedProcedure<
        typeof contract.planet.find,
        { cache: Map<string, string> }
      >
    >()
  })

  it('rejects the wrong output shape', () => {
    // @ts-expect-error output requires `name`
    impl.planet.find.handler(async ({ input }) => ({ id: input.id }))
    // @ts-expect-error output `id` must be a number
    impl.planet.find.handler(async () => ({ id: 'x', name: 'earth' }))
  })

  it('does not reject extra output keys', () => {
    // currently accepted: the handler return type is the union
    // `TOutput | Promise<TOutput>`, so the returned literal loses freshness and
    // only the structural check runs. Output checks are a runtime concern
    // (`validation.output: true`).
    impl.planet.find.handler(({ input }) => ({
      id: input.id,
      name: 'earth',
      extra: true,
    }))
    impl.planet.find.handler(async ({ input }) => ({
      id: input.id,
      name: 'earth',
      extra: true,
    }))
  })
})

describe('typed error factory', () => {
  it('requires declared data and forbids undeclared codes', () => {
    impl.planet.find.handler(async ({ errors, input }) => {
      expectTypeOf(errors.NOT_FOUND).parameters.toEqualTypeOf<
        [{ id: number }]
      >()
      expectTypeOf(errors.NOT_FOUND).returns.toBeNever()
      expectTypeOf(errors.GONE).parameters.toEqualTypeOf<[]>()
      if (input.id < 0) {
        throw errors.NOT_FOUND({ id: input.id })
      }
      if (input.id === 0) {
        throw errors.GONE()
      }
      return { id: input.id, name: 'earth' }
    })
    impl.planet.find.handler(async ({ errors }) => {
      // @ts-expect-error NOT_FOUND requires its declared data
      throw errors.NOT_FOUND()
    })
    impl.planet.find.handler(async ({ errors }) => {
      // @ts-expect-error data must match the declared schema
      throw errors.NOT_FOUND({ id: 'x' })
    })
    impl.planet.find.handler(async ({ errors }) => {
      // @ts-expect-error GONE declares no data
      throw errors.GONE({ id: 1 })
    })
    impl.planet.find.handler(async ({ errors }) => {
      // @ts-expect-error TEAPOT is not declared on this procedure
      throw errors.TEAPOT()
    })
    impl.planet.create.handler(async ({ errors }) => {
      // @ts-expect-error no errors declared on create
      throw errors.NOT_FOUND({ id: 1 })
    })
  })
})

describe('impl.router() completeness', () => {
  it('accepts the complete tree', () => {
    const app = impl.router({ planet: { find, create } })
    expectTypeOf(app).toEqualTypeOf<ImplementedRouter<typeof contract, Ctx>>()
    expectTypeOf(app.planet.find).toEqualTypeOf<
      ImplementedProcedure<typeof contract.planet.find, Ctx>
    >()
  })

  it('accepts a tree it already built', () => {
    const app = impl.router({ planet: { find, create } })
    expectTypeOf(impl.router(app)).toEqualTypeOf<
      ImplementedRouter<typeof contract, Ctx>
    >()
  })

  it('rejects a missing key', () => {
    impl.router({
      // @ts-expect-error create is required by the contract
      planet: { find },
    })
    // @ts-expect-error planet is required by the contract
    impl.router({})
  })

  it('rejects an extra key', () => {
    impl.router({
      planet: {
        find,
        create,
        // @ts-expect-error destroy is not in the contract
        destroy: create,
      },
    })
    impl.router({
      planet: { find, create },
      // @ts-expect-error moon is not in the contract
      moon: { find },
    })
  })

  it('rejects an extra key on a non-literal argument too', () => {
    // Excess-property checks only run on fresh literals; the inferred-`I`
    // check catches a variable with keys beyond the contract.
    const tree = { planet: { find, create, destroy: create } }
    // @ts-expect-error destroy is not in the contract
    impl.router(tree)
  })

  it('rejects a procedure implemented for another contract shape', () => {
    impl.router({
      planet: {
        find,
        // @ts-expect-error a handler result is required, not a contract
        create: contract.planet.create,
      },
    })
  })

  it('rejects a handler built from another procedure under this key', () => {
    impl.router({
      planet: {
        // @ts-expect-error create implements planet.create, not planet.find
        find: create,
        create,
      },
    })
  })

  it('accepts an unbranded ImplementedProcedure in any slot', () => {
    // The default type parameters mean "unbranded": a hand-typed value is
    // trusted the way it was before brands existed.
    const unbranded: ImplementedProcedure = find
    impl.router({ planet: { find: unbranded, create } })
  })
})

describe('middleware input typing', () => {
  it('.use() sees unknown input; .useAfter() sees typed input', () => {
    impl.planet.find
      .use(async ({ input, context, next }) => {
        expectTypeOf(input).toBeUnknown()
        expectTypeOf(context).toEqualTypeOf<Ctx>()
        return next()
      })
      .useAfter(async ({ input, context, next }) => {
        expectTypeOf(input).toEqualTypeOf<{ id: number }>()
        expectTypeOf(context).toEqualTypeOf<Ctx>()
        return next()
      })
      .handler(async ({ input }) => ({ id: input.id, name: 'earth' }))
  })

  it('.use() cannot read typed input fields', () => {
    impl.planet.find.use(async ({ input, next }) => {
      // @ts-expect-error input is unknown before validation
      input.id
      return next()
    })
  })

  it('root .use() / .middleware() see unknown input and typed context', () => {
    const mw = impl.middleware(async ({ input, context, next }) => {
      expectTypeOf(input).toBeUnknown()
      expectTypeOf(context).toEqualTypeOf<Ctx>()
      return next({ context: { db: 'y' } })
    })
    impl.use(mw).router({ planet: { find, create } })
    impl.use(async ({ next }) => {
      // @ts-expect-error db is a string
      return next({ context: { db: 1 } })
    })
  })

  it('middleware errors factory stays loose', () => {
    impl.planet.find.use(async ({ errors, next }) => {
      expectTypeOf(errors.ANYTHING).parameters.toEqualTypeOf<[unknown?]>()
      return next()
    })
  })
})

describe('$context<C>() across slices', () => {
  const planetContract = router({
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
  })
  const starContract = router({
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), kind: z.string() })),
    list: procedure.output(z.array(z.string())),
  })
  const rootContract = router({ planet: planetContract })

  it('flows into slice handlers', () => {
    const planetImpl = createImplementer(planetContract).$context<Ctx>()
    planetImpl.find.handler(async ({ context }) => {
      expectTypeOf(context).toEqualTypeOf<Ctx>()
      return { id: 1, name: 'earth' }
    })
  })

  it('nests a slice app built with the same context', () => {
    const planetImpl = createImplementer(planetContract).$context<Ctx>()
    const planetApp = planetImpl.router({
      find: planetImpl.find.handler(async () => ({ id: 1, name: 'earth' })),
    })
    const root = createImplementer(rootContract).$context<Ctx>()
    const app = root.router({ planet: planetApp })
    expectTypeOf(app).toEqualTypeOf<
      ImplementedRouter<typeof rootContract, Ctx>
    >()
  })

  it('rejects a slice app built with a different context', () => {
    // The context brand is contravariant: a slice that reads `context.cache`
    // cannot run under a root that only provides `db`.
    type OtherCtx = { cache: Map<string, string> }
    const planetImpl = createImplementer(planetContract).$context<OtherCtx>()
    const planetApp = planetImpl.router({
      find: planetImpl.find.handler(async ({ context }) => {
        expectTypeOf(context).toEqualTypeOf<OtherCtx>()
        return { id: 1, name: 'earth' }
      }),
    })
    const root = createImplementer(rootContract).$context<Ctx>()
    // @ts-expect-error planetApp expects { cache }, the root provides { db }
    root.router({ planet: planetApp })
  })

  it('rejects a slice that needs more context than the root provides', () => {
    type WiderCtx = Ctx & { cache: Map<string, string> }
    const planetImpl = createImplementer(planetContract).$context<WiderCtx>()
    const planetApp = planetImpl.router({
      find: planetImpl.find.handler(async () => ({ id: 1, name: 'earth' })),
    })
    const root = createImplementer(rootContract).$context<Ctx>()
    // @ts-expect-error planetApp expects { db, cache }, the root provides { db }
    root.router({ planet: planetApp })
  })

  it('accepts a slice that needs less context than the root provides', () => {
    type WiderCtx = Ctx & { cache: Map<string, string> }
    const planetImpl = createImplementer(planetContract).$context<Ctx>()
    const planetApp = planetImpl.router({
      find: planetImpl.find.handler(async () => ({ id: 1, name: 'earth' })),
    })
    const root = createImplementer(rootContract).$context<WiderCtx>()
    expectTypeOf(root.router({ planet: planetApp })).toEqualTypeOf<
      ImplementedRouter<typeof rootContract, WiderCtx>
    >()
  })

  it('rejects a slice app that lacks a contract key', () => {
    const moonContract = router({
      list: procedure.output(z.array(z.string())),
    })
    const moonImpl = createImplementer(moonContract).$context<Ctx>()
    const moonApp = moonImpl.router({
      list: moonImpl.list.handler(async () => []),
    })
    const root = createImplementer(rootContract).$context<Ctx>()
    // @ts-expect-error moonApp has no `find`
    root.router({ planet: moonApp })
  })

  it('rejects a slice app for a superset contract', () => {
    // The inferred-`I` check flags `planet.list` even though `starApp` is a
    // variable (no excess-property check). The runtime `assertComplete`
    // throws the same way (router-complete.test.ts).
    const starImpl = createImplementer(starContract).$context<Ctx>()
    const starApp = starImpl.router({
      find: starImpl.find.handler(async () => ({ id: 1, kind: 'g' })),
      list: starImpl.list.handler(async () => []),
    })
    const root = createImplementer(rootContract).$context<Ctx>()
    // @ts-expect-error starApp has `list`, which planetContract lacks
    root.router({ planet: starApp })
  })

  it('rejects a handler from another slice under the wrong key', () => {
    const bothContract = router({ planet: planetContract, star: starContract })
    const both = createImplementer(bothContract).$context<Ctx>()
    const starFind = both.star.find.handler(async ({ input }) => ({
      id: input.id,
      kind: 'g',
    }))
    both.router({
      planet: {
        // @ts-expect-error star.find outputs { kind }, planet.find needs { name }
        find: starFind,
      },
      star: { find: starFind, list: both.star.list.handler(async () => []) },
    })
  })

  it('composes picked procedures for a second server', () => {
    const usersContract = router({
      list: procedure.output(z.array(z.object({ id: z.number() }))),
      listPopulated: procedure.output(
        z.array(z.object({ id: z.number(), name: z.string() })),
      ),
    })
    const usersImpl = createImplementer(usersContract).$context<Ctx>()
    const usersApp = usersImpl.router({
      list: usersImpl.list.handler(async () => []),
      listPopulated: usersImpl.listPopulated.handler(async () => []),
    })
    const webContract = router({
      users: router({ list: usersContract.list }),
    })
    const webImpl = createImplementer(webContract).$context<Ctx>()
    const webApp = webImpl.router({ users: { list: usersApp.list } })
    expectTypeOf(webApp).toEqualTypeOf<
      ImplementedRouter<typeof webContract, Ctx>
    >()
    webImpl.router({
      users: {
        // @ts-expect-error listPopulated is not the picked procedure
        list: usersApp.listPopulated,
      },
    })
  })
})

describe('createLocalClient context', () => {
  const app = impl.router({ planet: { find, create } })

  it('is checked against $context<C>()', () => {
    createLocalClient(app, { context: { db: 'x' } })
    // @ts-expect-error context must be { db }
    createLocalClient(app, { context: { wrong: 1 } })
    // @ts-expect-error db is a string
    createLocalClient(app, { context: { db: 1 } })
    // @ts-expect-error context is required
    createLocalClient(app, {})
  })

  it('is object when $context() was not called', () => {
    const plain = createImplementer(contract)
    const plainApp = plain.router({
      planet: {
        find: plain.planet.find.handler(async ({ input }) => ({
          id: input.id,
          name: 'earth',
        })),
        create: plain.planet.create.handler(async () => ({ id: 1 })),
      },
    })
    expectTypeOf(plainApp).toEqualTypeOf<
      ImplementedRouter<typeof contract, object>
    >()
    createLocalClient(plainApp, { context: {} })
    createLocalClient(plainApp, { context: { anything: true } })
    // @ts-expect-error a primitive is not an object
    createLocalClient(plainApp, { context: 'x' })
  })

  it('is unknown for an unbranded router', () => {
    const annotated: ImplementedRouter<typeof contract> = app
    const handBuilt: ImplementedRouter = { planet: { find, create } }
    const client = createLocalClient(annotated, { context: 'anything' })
    expectTypeOf(client.planet.find)
      .parameter(0)
      .toEqualTypeOf<{ id: number }>()
    createLocalClient(handBuilt, { context: undefined })
  })
})
