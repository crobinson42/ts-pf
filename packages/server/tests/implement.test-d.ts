import { procedure, router } from '@ts-pf/contract'
import {
  createImplementer,
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
    expectTypeOf(find).toEqualTypeOf<ImplementedProcedure>()
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
    expectTypeOf(app).toEqualTypeOf<ImplementedRouter<typeof contract>>()
    expectTypeOf(app.planet.find).toEqualTypeOf<ImplementedProcedure>()
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

  it('rejects a procedure implemented for another contract shape', () => {
    impl.router({
      planet: {
        find,
        // @ts-expect-error a handler result is required, not a contract
        create: contract.planet.create,
      },
    })
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
    expectTypeOf(app).toEqualTypeOf<ImplementedRouter<typeof rootContract>>()
  })

  it('does not reject a slice app built with a different context', () => {
    // currently accepted; see review finding D3
    // ImplementedRouter<T> carries the contract, not the context type, so a
    // slice implemented against `{ cache: Map }` nests under a `{ db: string }`
    // root without a type error. The runtime context is whatever the caller
    // passes, so the slice would read `context.cache` as undefined.
    type OtherCtx = { cache: Map<string, string> }
    const planetImpl = createImplementer(planetContract).$context<OtherCtx>()
    const planetApp = planetImpl.router({
      find: planetImpl.find.handler(async ({ context }) => {
        expectTypeOf(context).toEqualTypeOf<OtherCtx>()
        return { id: 1, name: 'earth' }
      }),
    })
    const root = createImplementer(rootContract).$context<Ctx>()
    const app = root.router({ planet: planetApp })
    expectTypeOf(app).toEqualTypeOf<ImplementedRouter<typeof rootContract>>()
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

  it('does not reject a slice app for a superset contract', () => {
    // currently accepted; see review finding D3
    // `ImplementedRouter<T>` brands the contract only optionally and a
    // variable is not excess-property checked, so a star app whose keys are a
    // superset of the planet contract nests without a type error. The runtime
    // `assertComplete` throws `Unexpected implementation key "planet.list"`
    // (covered in router-complete.test.ts).
    const starContract = router({
      find: procedure
        .input(z.object({ id: z.number() }))
        .output(z.object({ id: z.number(), kind: z.string() })),
      list: procedure.output(z.array(z.string())),
    })
    const starImpl = createImplementer(starContract).$context<Ctx>()
    const starApp = starImpl.router({
      find: starImpl.find.handler(async () => ({ id: 1, kind: 'g' })),
      list: starImpl.list.handler(async () => []),
    })
    const root = createImplementer(rootContract).$context<Ctx>()
    const app = root.router({ planet: starApp })
    expectTypeOf(app).toEqualTypeOf<ImplementedRouter<typeof rootContract>>()
  })
})
