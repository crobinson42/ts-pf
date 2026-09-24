import type { z } from 'zod'
import type { Caller } from './caller.js'
import {
  type FailMap,
  InvalidOutput,
  isRejected,
  type Outcome,
  type SchemaIssue,
  settle,
  UseCaseRejected,
} from './rejected.js'

type ZodType<T = unknown> = z.ZodType<T>
type StepPhase = 'before' | 'after'
type Mode = 'none' | 'value' | 'stream'
type ErrorSpec = Record<string, { data?: ZodType }>

type EmptyIfUnknown<T> = unknown extends T ? {} : T

export declare const noNarrow: unique symbol
export type NoNarrow = { readonly [noNarrow]: true }

type Guard<
  Needs,
  Phase extends 'open' | 'input',
  Input,
  Requires,
  Produces,
  Failures extends ErrorSpec,
> = {
  readonly kind: 'use-case-guard'
  readonly phase: Phase
  readonly needs: Needs
  readonly reads: Input
  readonly requires: Requires
  readonly produces: Produces
  readonly failures: Failures
  run(
    caller: Caller,
    deps: Needs,
    input: Phase extends 'input' ? Input : undefined,
  ): true | Promise<true>
}

type DepsOf<Spec> = Spec extends { deps: infer Deps } ? Deps : {}
type CallerOf<Spec> = Spec extends { caller: infer Required } ? Required : never
type NeedsOf<G> = G extends { readonly needs: infer N } ? N : {}
type ProducedOf<G> = G extends { readonly produces: infer P } ? P : NoNarrow

type NarrowedCaller<Check, Fallback> = Check extends (
  // biome-ignore lint/suspicious/noExplicitAny: predicate parameters are contravariant
  ctx: any,
) => ctx is infer Yes
  ? Yes extends { caller: infer Next }
    ? Next
    : Fallback
  : Fallback

type NextOut<Out, Produces> = Produces extends NoNarrow
  ? Out
  : Produces extends Out
    ? Produces
    : Out

type GapKeys<Have, Need> = {
  [K in keyof Need]: K extends keyof Have
    ? Have[K] extends Need[K]
      ? never
      : K & string
    : K & string
}[keyof Need]

type Rest<Out, Requires, Deps, Needs, Produces> = [
  GapKeys<Out, Requires>,
] extends [never]
  ? [GapKeys<Deps, Needs>] extends [never]
    ? Produces extends NoNarrow
      ? never
      : Produces extends Out
        ? never
        : 'This guard drops caller fields. Keep traceId.'
    : `This guard needs deps this use case does not provide: ${GapKeys<
        Deps,
        Needs
      > &
        string}.`
  : `This guard needs a narrower caller.${GapKeys<Out, Requires> &
      string}. Run that narrowing guard first.`

type Fail<G, Out, Deps, Phase extends StepPhase, Input> =
  G extends Guard<
    infer Needs,
    infer Ph,
    infer In,
    infer Requires,
    infer Produces,
    infer _Failures
  >
    ? Ph extends 'input'
      ? Phase extends 'after'
        ? Input extends In
          ? Rest<Out, Requires, Deps, Needs, Produces>
          : 'Parsed input does not match this guard.'
        : 'This guard reads input. Move it below .input().'
      : Rest<Out, Requires, Deps, Needs, Produces>
    : 'Pass a guard created with useCase.narrow() or useCase.guard().'

type Throwers<Err extends ErrorSpec> = {
  [K in keyof Err]: Err[K] extends { data: ZodType<infer D> }
    ? (data: D) => never
    : () => never
}

type SpecUnion<Spec extends ErrorSpec> = {
  [K in keyof Spec]: Spec[K] extends { data: ZodType<infer D> }
    ? { code: K & string; data: D }
    : { code: K & string }
}[keyof Spec]

type Declared<GuardErr extends ErrorSpec, Err extends ErrorSpec> =
  | SpecUnion<GuardErr>
  | SpecUnion<Err>

type Failure<
  GuardErr extends ErrorSpec,
  HasInput extends boolean,
  Err extends ErrorSpec,
> =
  | Declared<GuardErr, Err>
  | (HasInput extends true ? { code: 'INVALID'; issues: SchemaIssue[] } : never)

type FailuresOf<G> = G extends { readonly failures: infer F extends ErrorSpec }
  ? F
  : {}

type OverlapKeys<A, B> = keyof A & keyof B & string

type DataOf<Spec, K extends string> = K extends keyof Spec
  ? Spec[K] extends { data: ZodType<infer D> }
    ? D
    : undefined
  : undefined

type PayloadSame<Have, Add> = [OverlapKeys<Have, Add>] extends [never]
  ? true
  : {
        [K in OverlapKeys<Have, Add>]: [
          DataOf<Have, K>,
          DataOf<Add, K>,
        ] extends [DataOf<Add, K>, DataOf<Have, K>]
          ? true
          : false
      }[OverlapKeys<Have, Add>] extends true
    ? true
    : false

type Attach<
  G,
  Out,
  Deps,
  Phase extends StepPhase,
  Input,
  GuardErr extends ErrorSpec,
  Err extends ErrorSpec,
> = [Fail<G, Out, Deps, Phase, Input>] extends [never]
  ? [OverlapKeys<Err, FailuresOf<G>>] extends [never]
    ? [OverlapKeys<GuardErr, FailuresOf<G>>] extends [never]
      ? G
      : PayloadSame<GuardErr, FailuresOf<G>> extends true
        ? G
        : G &
            `${OverlapKeys<GuardErr, FailuresOf<G>> & string} is already declared with a different payload.`
    : G &
        `${OverlapKeys<Err, FailuresOf<G>> & string} is already declared on this use case.`
  : G & Fail<G, Out, Deps, Phase, Input>

type RunCtx<
  Out,
  Deps,
  Input,
  Err extends ErrorSpec,
  HasInput extends boolean,
> = {
  deps: Deps
  caller: Out
  errors: Throwers<Err>
  signal?: AbortSignal
} & (HasInput extends true ? { input: Input } : Record<never, never>)

type RunReturn<Mode extends 'value' | 'stream', Output> = Mode extends 'stream'
  ? AsyncIterable<Output>
  : Output | Promise<Output>

type HandlerCtx<Deps, Input> = {
  input: Input
  context: { deps: Deps; caller: Caller }
  errors: never
  signal?: AbortSignal
}

type ProcedureLike<Deps, Input, Success, E, R> = {
  handler: (
    fn: (
      ctx: Omit<HandlerCtx<Deps, Input>, 'errors'> & { errors: E },
    ) => Success | Promise<Success>,
  ) => R
}

export type UseCase<
  Deps,
  Input,
  Success,
  E,
  HasInput extends boolean,
  Codes,
> = ((
  args: {
    deps: Deps
    caller: Caller
    signal?: AbortSignal
  } & (HasInput extends true ? { input: Input } : { input?: never }),
) => Promise<Outcome<Success, E>>) & {
  readonly kind: 'use-case'
  readonly summary: string
  readonly codes: readonly string[]
  readonly input: HasInput extends true ? ZodType<Input> : undefined
  readonly output: Success extends AsyncIterable<unknown>
    ? undefined
    : ZodType<Success>
  readonly item: Success extends AsyncIterable<infer Item>
    ? ZodType<Item>
    : undefined
  mount<R, Factory>(
    procedure: ProcedureLike<Deps, Input, Success, Factory, R>,
    ...map: [Codes] extends [never]
      ? []
      : [toMap: (errors: Factory) => FailMap<Codes>]
  ): R
}

type Step =
  | {
      kind: 'guard'
      run: (
        caller: Caller,
        deps: unknown,
        input: unknown,
      ) => unknown | Promise<unknown>
    }
  | { kind: 'input'; schema: ZodType }

class Builder<
  Out,
  Deps,
  Need,
  Input,
  Phase extends StepPhase,
  Err extends ErrorSpec,
  GuardErr extends ErrorSpec,
  HasInput extends boolean,
  OutMode extends Mode,
  Output,
> {
  private readonly steps: Step[] = []
  private inputSchema: ZodType | undefined
  private outputSchema: ZodType | undefined
  private itemSchema: ZodType | undefined
  private errorMap: ErrorSpec = {}
  private guardCodes: string[] = []

  constructor(private readonly summary: string) {}

  deps<D extends Need>(): Builder<
    Out,
    D,
    Need,
    Input,
    Phase,
    Err,
    GuardErr,
    HasInput,
    OutMode,
    Output
  > {
    return this as unknown as Builder<
      Out,
      D,
      Need,
      Input,
      Phase,
      Err,
      GuardErr,
      HasInput,
      OutMode,
      Output
    >
  }

  caller<G>(
    guard: Attach<G, Out, Deps, Phase, Input, GuardErr, Err>,
  ): Builder<
    NextOut<Out, ProducedOf<G>>,
    Deps,
    Need & EmptyIfUnknown<NeedsOf<G>>,
    Input,
    Phase,
    Err,
    GuardErr & FailuresOf<G>,
    HasInput,
    OutMode,
    Output
  > {
    if (
      typeof guard !== 'object' ||
      guard === null ||
      (guard as { kind?: unknown }).kind !== 'use-case-guard'
    ) {
      throw new Error(
        'Pass a guard created with useCase.guard.errors(), useCase.guard.narrow(), or useCase.guard.check().',
      )
    }
    const value = guard as unknown as {
      failures?: ErrorSpec
      run: (
        caller: Caller,
        deps: unknown,
        input: unknown,
      ) => true | Promise<true>
    }
    for (const code of Object.keys(value.failures ?? {})) {
      if (!this.guardCodes.includes(code)) {
        this.guardCodes.push(code)
      }
    }
    this.steps.push({
      kind: 'guard',
      run: (caller, deps, parsed) => value.run(caller, deps, parsed),
    })
    return this as never
  }

  input<Schema extends ZodType>(
    schema: Schema,
  ): Builder<
    Out,
    Deps,
    Need,
    z.infer<Schema>,
    'after',
    Err,
    GuardErr,
    true,
    OutMode,
    Output
  > {
    this.inputSchema = schema
    this.steps.push({ kind: 'input', schema })
    return this as unknown as Builder<
      Out,
      Deps,
      Need,
      z.infer<Schema>,
      'after',
      Err,
      GuardErr,
      true,
      OutMode,
      Output
    >
  }

  output<Schema extends ZodType>(
    schema: Schema,
  ): Builder<
    Out,
    Deps,
    Need,
    Input,
    Phase,
    Err,
    GuardErr,
    HasInput,
    'value',
    z.infer<Schema>
  > {
    this.outputSchema = schema
    this.itemSchema = undefined
    return this as unknown as Builder<
      Out,
      Deps,
      Need,
      Input,
      Phase,
      Err,
      GuardErr,
      HasInput,
      'value',
      z.infer<Schema>
    >
  }

  stream<Schema extends ZodType>(
    schema: Schema,
  ): Builder<
    Out,
    Deps,
    Need,
    Input,
    Phase,
    Err,
    GuardErr,
    HasInput,
    'stream',
    z.infer<Schema>
  > {
    this.itemSchema = schema
    this.outputSchema = undefined
    return this as unknown as Builder<
      Out,
      Deps,
      Need,
      Input,
      Phase,
      Err,
      GuardErr,
      HasInput,
      'stream',
      z.infer<Schema>
    >
  }

  errors<Map extends ErrorSpec>(
    map: [OverlapKeys<GuardErr, Map>] extends [never]
      ? Map
      : Map &
          `${OverlapKeys<GuardErr, Map> & string} is already declared by a guard.`,
  ): Builder<
    Out,
    Deps,
    Need,
    Input,
    Phase,
    Map,
    GuardErr,
    HasInput,
    OutMode,
    Output
  > {
    this.errorMap = map as ErrorSpec
    return this as unknown as Builder<
      Out,
      Deps,
      Need,
      Input,
      Phase,
      Map,
      GuardErr,
      HasInput,
      OutMode,
      Output
    >
  }

  run(
    fn: [Deps] extends [Need]
      ? OutMode extends 'none'
        ? never
        : (
            ctx: RunCtx<Out, Deps, Input, Err, HasInput>,
          ) => RunReturn<OutMode extends 'stream' ? 'stream' : 'value', Output>
      : never,
  ): UseCase<
    Deps,
    Input,
    OutMode extends 'stream' ? AsyncIterable<Output> : Output,
    Failure<GuardErr, HasInput, Err>,
    HasInput,
    Declared<GuardErr, Err>
  > {
    const summary = this.summary
    const steps = this.steps.slice()
    const inputSchema = this.inputSchema
    const outputSchema = this.outputSchema
    const itemSchema = this.itemSchema
    const errorMap = this.errorMap
    const guardCodes = this.guardCodes.slice()
    const codes = [
      ...guardCodes,
      ...Object.keys(errorMap).filter((code) => !guardCodes.includes(code)),
    ]

    const call = async (args: {
      deps: Deps
      caller: Caller
      input?: Input
      signal?: AbortSignal
    }): Promise<
      Outcome<unknown, { code: string; data?: unknown; issues?: SchemaIssue[] }>
    > => {
      let parsed: unknown
      try {
        for (const step of steps) {
          if (step.kind === 'guard') {
            const ok = await step.run(args.caller, args.deps, parsed)
            if (ok !== true) {
              throw new Error(
                'A guard must return true or throw a declared error.',
              )
            }
            continue
          }
          const checked = step.schema.safeParse(args.input)
          if (!checked.success) {
            return {
              ok: false,
              error: { code: 'INVALID', issues: checked.error.issues },
            }
          }
          parsed = checked.data
        }
        const errors = throwers(errorMap)
        const produced = fn({
          deps: args.deps,
          caller: args.caller as Out,
          errors: errors as Throwers<Err>,
          ...(args.signal ? { signal: args.signal } : {}),
          ...(inputSchema ? { input: parsed as Input } : {}),
        } as RunCtx<Out, Deps, Input, Err, HasInput>)
        if (itemSchema) {
          return {
            ok: true,
            data: checkEach(asIterable(produced), itemSchema),
          }
        }
        const value = await produced
        const checked = outputSchema?.safeParse(value)
        if (checked && !checked.success) {
          throw new InvalidOutput(checked.error.issues)
        }
        return { ok: true, data: checked ? checked.data : value }
      } catch (error) {
        if (isRejected(error) && codes.includes(error.code)) {
          return {
            ok: false,
            error:
              error.data === undefined
                ? { code: error.code }
                : { code: error.code, data: error.data },
          }
        }
        throw error
      }
    }

    type Built = UseCase<
      Deps,
      Input,
      OutMode extends 'stream' ? AsyncIterable<Output> : Output,
      Failure<GuardErr, HasInput, Err>,
      HasInput,
      Declared<GuardErr, Err>
    >
    const mount: Built['mount'] = (procedure, ...map) => {
      return procedure.handler(async (ctx) => {
        const result = await call({
          deps: ctx.context.deps,
          caller: ctx.context.caller,
          ...(inputSchema ? { input: ctx.input as Input } : {}),
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        })
        const fail = map[0]?.(ctx.errors) ?? {}
        return settle(
          result as Outcome<
            OutMode extends 'stream' ? AsyncIterable<Output> : Output,
            Failure<GuardErr, HasInput, Err>
          >,
          fail as FailMap<never>,
        )
      })
    }
    const useCase = Object.assign(call, {
      kind: 'use-case' as const,
      summary,
      codes,
      input: inputSchema as HasInput extends true ? ZodType<Input> : undefined,
      output: outputSchema as Built['output'],
      item: itemSchema as Built['item'],
      mount,
    })
    return useCase as Built
  }
}

function throwers(
  errorMap: ErrorSpec,
): Record<string, (data?: unknown) => never> {
  const errors: Record<string, (data?: unknown) => never> = {}
  for (const [code, spec] of Object.entries(errorMap)) {
    errors[code] = (data?: unknown) => {
      if (spec.data) {
        const checked = spec.data.safeParse(data)
        if (!checked.success) {
          throw new InvalidOutput(checked.error.issues)
        }
        throw new UseCaseRejected(code, checked.data)
      }
      throw new UseCaseRejected(code)
    }
  }
  return errors
}

function asIterable(value: unknown): AsyncIterable<unknown> {
  if (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value
  ) {
    return value as AsyncIterable<unknown>
  }
  throw new InvalidOutput([])
}

async function* checkEach(
  source: AsyncIterable<unknown>,
  schema: ZodType,
): AsyncGenerator<unknown> {
  for await (const item of source) {
    const checked = schema.safeParse(item)
    if (!checked.success) {
      throw new InvalidOutput(checked.error.issues)
    }
    yield checked.data
  }
}

export function createUseCase<C>() {
  function useCase(summary: string) {
    return new Builder<
      C,
      {},
      {},
      unknown,
      'before',
      {},
      {},
      false,
      'none',
      unknown
    >(summary)
  }

  function guardApi<E extends ErrorSpec>(spec: E) {
    const fail = throwers(spec) as Throwers<E>
    return {
      narrow<
        Check extends (ctx: {
          caller: C
          errors: Throwers<E>
        }) => ctx is { caller: C; errors: Throwers<E> },
      >(
        check: Check,
      ): Guard<{}, 'open', never, C, NarrowedCaller<Check, C>, E> {
        return {
          kind: 'use-case-guard',
          phase: 'open',
          needs: {},
          reads: undefined as never,
          requires: undefined as never as C,
          produces: undefined as never as NarrowedCaller<Check, C>,
          failures: spec,
          run(caller) {
            const ok = (
              check as unknown as (ctx: {
                caller: C
                errors: Throwers<E>
              }) => boolean
            )({ caller: caller as C, errors: fail })
            return ok === true ? true : (false as never)
          },
        }
      },
      check<Spec extends { caller: C; deps: object }>(
        fn: (ctx: Spec & { errors: Throwers<E> }) => Promise<true>,
      ): Spec extends { input: infer I }
        ? Guard<DepsOf<Spec>, 'input', I, CallerOf<Spec>, NoNarrow, E>
        : Guard<DepsOf<Spec>, 'open', never, CallerOf<Spec>, NoNarrow, E> {
        return {
          kind: 'use-case-guard',
          phase: 'open',
          needs: {},
          reads: undefined as never,
          requires: undefined as never as CallerOf<Spec>,
          produces: undefined as never as NoNarrow,
          failures: spec,
          run(caller, deps, input) {
            return fn({
              caller,
              deps,
              input,
              errors: fail,
            } as unknown as Spec & { errors: Throwers<E> })
          },
        } as Spec extends { input: infer I }
          ? Guard<DepsOf<Spec>, 'input', I, CallerOf<Spec>, NoNarrow, E>
          : Guard<DepsOf<Spec>, 'open', never, CallerOf<Spec>, NoNarrow, E>
      },
    }
  }

  function narrow<
    Check extends (ctx: {
      caller: C
      errors: Throwers<{}>
    }) => ctx is { caller: C; errors: Throwers<{}> },
  >(check: Check) {
    return guardApi({}).narrow(check)
  }

  const guard = {
    errors<E extends ErrorSpec>(spec: E) {
      return guardApi(spec)
    },
    narrow,
    check<Spec extends { caller: C; deps: object }>(
      fn: (ctx: Spec & { errors: Throwers<{}> }) => Promise<true>,
    ) {
      return guardApi({}).check(fn)
    },
  }

  return Object.assign(useCase, { guard })
}

export const useCase = createUseCase<Caller>()
