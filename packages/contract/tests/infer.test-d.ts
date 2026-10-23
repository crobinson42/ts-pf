import {
  type CallOptions,
  type ClientError,
  type ContractClient,
  type ContractProcedure,
  type ContractResultPromise,
  type InferContractErrorCodes,
  type InferContractInputs,
  type InferContractOutputs,
  type InferContractProcedure,
  type IsContractProcedure,
  procedure,
  router,
} from '@ts-pf/contract'
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
    list: procedure.output(z.array(z.string())),
    touch: procedure.input(z.object({ id: z.number() })),
  },
})

type Client = ContractClient<typeof contract>
type FindError = NonNullable<ReturnType<Client['planet']['find']>['~pfError']>

type ProtocolCode =
  | 'BAD_REQUEST'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'INTERNAL'
  | 'METHOD_NOT_ALLOWED'
  | 'PAYLOAD_TOO_LARGE'

declare const client: Client

describe('ContractClient inference', () => {
  it('infers input and output per procedure', () => {
    expectTypeOf<
      InferContractInputs<typeof contract>['planet']['find']
    >().toEqualTypeOf<{ id: number }>()
    expectTypeOf<
      InferContractOutputs<typeof contract>['planet']['find']
    >().toEqualTypeOf<{ id: number; name: string }>()
    expectTypeOf<
      InferContractErrorCodes<typeof contract>['planet']['find']
    >().toEqualTypeOf<'NOT_FOUND' | 'GONE'>()
  })

  it('types call signatures with CallOptions', () => {
    expectTypeOf<Client['planet']['find']>().parameters.toEqualTypeOf<
      [{ id: number }, (CallOptions | undefined)?]
    >()
    expectTypeOf<Client['planet']['list']>().parameters.toEqualTypeOf<
      [(CallOptions | undefined)?]
    >()
    expectTypeOf<CallOptions>().toEqualTypeOf<{ signal?: AbortSignal }>()
    expectTypeOf<Client['planet']['find']>().returns.toEqualTypeOf<
      ContractResultPromise<{ id: number; name: string }, FindError>
    >()
    expectTypeOf(client.planet.find({ id: 1 })).resolves.toEqualTypeOf<{
      id: number
      name: string
    }>()
    expectTypeOf(client.planet.list()).resolves.toEqualTypeOf<string[]>()
  })

  it('omitted .output() is unknown', () => {
    expectTypeOf<
      InferContractOutputs<typeof contract>['planet']['touch']
    >().toEqualTypeOf<unknown>()
    expectTypeOf(client.planet.touch({ id: 1 })).resolves.toBeUnknown()
  })

  it('rejects the wrong input type', () => {
    // @ts-expect-error id must be a number
    client.planet.find({ id: 'earth' })
    // @ts-expect-error input is required
    client.planet.find()
    // @ts-expect-error extra input keys are rejected
    client.planet.find({ id: 1, name: 'earth' })
    // @ts-expect-error a no-input procedure takes only CallOptions
    client.planet.list({ id: 1 })
    // @ts-expect-error unknown procedure path
    client.planet.nope
  })
})

describe('InferContractProcedure', () => {
  it('reads a builder and a hand-written ContractProcedure the same way', () => {
    type Find = typeof contract.planet.find
    type Written = ContractProcedure<
      { id: number },
      { id: number; name: string },
      Find['~pf']['errors']
    >
    expectTypeOf<InferContractProcedure<Find>>().toEqualTypeOf<{
      input: { id: number }
      output: { id: number; name: string }
      errors: Find['~pf']['errors']
      meta: {}
    }>()
    expectTypeOf<InferContractProcedure<Written>['input']>().toEqualTypeOf<
      InferContractProcedure<Find>['input']
    >()
    expectTypeOf<InferContractProcedure<Written>['output']>().toEqualTypeOf<
      InferContractProcedure<Find>['output']
    >()
    type List = InferContractProcedure<typeof contract.planet.list>
    expectTypeOf<List['input']>().toBeVoid()
    expectTypeOf<Omit<List, 'input'>>().toEqualTypeOf<{
      output: string[]
      errors: {}
      meta: {}
    }>()
  })

  it('is never for routers and plain values', () => {
    expectTypeOf<InferContractProcedure<typeof contract>>().toBeNever()
    expectTypeOf<InferContractProcedure<typeof contract.planet>>().toBeNever()
    expectTypeOf<InferContractProcedure<{ a: 1 }>>().toBeNever()
    expectTypeOf<InferContractProcedure<string>>().toBeNever()
    expectTypeOf<
      IsContractProcedure<typeof contract.planet.find>
    >().toEqualTypeOf<true>()
    expectTypeOf<
      IsContractProcedure<typeof contract.planet>
    >().toEqualTypeOf<false>()
    expectTypeOf<IsContractProcedure<never>>().toEqualTypeOf<false>()
  })

  it('tells builders with different input or output apart', () => {
    // The phantom `~types` on ContractBuilder makes two builders with
    // different input / output non-assignable, like ContractProcedure.
    expectTypeOf<typeof contract.planet.find>().not.toExtend<
      typeof contract.planet.list
    >()
    expectTypeOf<typeof contract.planet.list>().not.toExtend<
      typeof contract.planet.find
    >()
  })
})

describe('ClientError union', () => {
  it('is exactly the declared variants plus the remaining protocol codes', () => {
    expectTypeOf<FindError['code']>().toEqualTypeOf<
      'NOT_FOUND' | 'GONE' | ProtocolCode
    >()
    expectTypeOf<FindError>().toEqualTypeOf<
      ClientError<(typeof contract.planet.find)['~pf']['errors']>
    >()
    // A declared code replaces the protocol variant of the same name:
    // NOT_FOUND data is the declared schema, never `unknown`.
    expectTypeOf<
      Extract<FindError, { code: 'NOT_FOUND' }>['data']
    >().toEqualTypeOf<{ id: number }>()
    expectTypeOf<
      Extract<FindError, { code: 'GONE' }>['data']
    >().toEqualTypeOf<undefined>()
    expectTypeOf<
      Extract<FindError, { code: 'VALIDATION' }>['data']
    >().toEqualTypeOf<{
      issues: { message: string; path: Array<string | number> }[]
    }>()
  })

  it('is not widened to an open-coded error', () => {
    // A PFError-shaped value with `code: string` must not be assignable:
    // the union is closed over declared + protocol codes.
    expectTypeOf<{
      code: string
      status: number
      message: string
    }>().not.toExtend<FindError>()
    expectTypeOf<{
      code: 'TEAPOT'
      status: number
      message: string
    }>().not.toExtend<FindError>()
  })

  it('narrows data from code', () => {
    function take(err: FindError) {
      if (err.code === 'NOT_FOUND') {
        expectTypeOf(err.data).toEqualTypeOf<{ id: number }>()
      } else if (err.code === 'GONE') {
        expectTypeOf(err.data).toEqualTypeOf<undefined>()
      } else if (err.code === 'INTERNAL') {
        expectTypeOf(err.data).toEqualTypeOf<unknown>()
      }
    }
    take({ code: 'GONE', status: 410, message: 'x' })
  })

  it('types status as optional transport metadata', () => {
    expectTypeOf<FindError['status']>().toEqualTypeOf<number | undefined>()
    function take(err: FindError) {
      // status is undefined on message transports and mid-stream items.
      expectTypeOf(err.status).toEqualTypeOf<number | undefined>()
      // @ts-expect-error status may be undefined; guard or default it
      err.status.toFixed()
      return err.status ?? 400
    }
    take({ code: 'GONE', message: 'x' })
    take({ code: 'INTERNAL', message: 'x' })
  })

  it('has only the protocol codes when nothing is declared', () => {
    type ListError = NonNullable<
      ReturnType<Client['planet']['list']>['~pfError']
    >
    expectTypeOf<ListError['code']>().toEqualTypeOf<ProtocolCode>()
  })
})

describe('procedure meta typing', () => {
  it('$meta<M>() declares the meta type', () => {
    const declared = procedure.$meta<{ auth: boolean }>()
    expectTypeOf(declared['~pf'].meta).toEqualTypeOf<{ auth: boolean }>()
    const proc = declared.meta({ auth: true })
    expectTypeOf(proc['~pf'].meta).toEqualTypeOf<
      { auth: boolean } & { auth: boolean }
    >()
  })

  it('$meta<M>() does not constrain later .meta() values', () => {
    // currently accepted: .meta() intersects TMeta & M instead of checking M
    // against the declared type, so a conflicting key is not a type error.
    const proc = procedure.$meta<{ auth: boolean }>().meta({ auth: 'yes' })
    expectTypeOf(proc['~pf'].meta).toEqualTypeOf<
      { auth: boolean } & { auth: string }
    >()
  })

  it('.meta() accumulates keys', () => {
    const proc = procedure.meta({ auth: true }).meta({ tag: 'planet' })
    expectTypeOf(proc['~pf'].meta).toEqualTypeOf<
      { auth: boolean } & { tag: string }
    >()
  })

  it('meta does not change input, output, or errors', () => {
    const proc = procedure
      .input(z.object({ id: z.number() }))
      .output(z.string())
      .meta({ auth: true })
    type Inputs = InferContractInputs<{ proc: typeof proc }>
    type Outputs = InferContractOutputs<{ proc: typeof proc }>
    expectTypeOf<Inputs['proc']>().toEqualTypeOf<{ id: number }>()
    expectTypeOf<Outputs['proc']>().toEqualTypeOf<string>()
  })
})
