import {
  type ContractProcedure,
  type ErrorMap,
  type InferContractProcedure,
  type IsContractProcedure,
  validateSchema,
} from '@ts-pf/contract'
import { isAsyncIterable, PFError } from '@ts-pf/protocol'
import {
  type CallInterceptor,
  runCallInterceptors,
} from './call-interceptor.js'
import { createErrorFactory, finalizeDeclaredError } from './error-factory.js'
import type { MiddlewareFn } from './middleware.js'

export type HandlerFn = (opts: {
  input: unknown
  context: unknown
  errors: ReturnType<typeof createErrorFactory>
  path: string[]
  signal?: AbortSignal
}) => unknown | Promise<unknown>

/**
 * The `{ input, output, errors }` of a contract procedure type, or `never`
 * for anything else: contract's `InferContractProcedure` minus `meta`, so
 * procedures that differ only in `.meta()` share a brand. Brands compare this
 * shape, not the procedure type itself, so a handler for `star.find` cannot
 * fill the `planet.find` slot even when the two types are assignable.
 */
export type ContractShape<T> = [InferContractProcedure<T>] extends [never]
  ? never
  : Pick<InferContractProcedure<T>, 'input' | 'output' | 'errors'>

/** String keys of a contract router, minus the `~pf` brand. */
export type ContractKeys<T> = Exclude<keyof T & string, '~pf'>

// Type-only brands. Never present at runtime; optional so an unbranded value
// (the defaults, or a tree not produced by `impl.router()`) is accepted
// wherever a branded one is. The explicit `| undefined` keeps a mismatch a
// plain TS2322 under `exactOptionalPropertyTypes` instead of a TS2375
// "consider adding undefined" that hides the real reason.
// Invariant (the shape is both parameter and return), so only a handler for
// the same `{ input, output, errors }` fits a slot: `users.listPopulated` does
// not fit `users.list` even though its output is a structural subtype.
type ContractBrand<TContract> = unknown extends TContract
  ? {}
  : {
      readonly '~contract'?:
        | ((shape: ContractShape<TContract>) => ContractShape<TContract>)
        | undefined
    }

// Contravariant: a procedure that needs `TCtx` fits where a subtype of `TCtx`
// is provided, not the other way round.
type ContextBrand<TCtx> = unknown extends TCtx
  ? {}
  : { readonly '~context'?: ((context: TCtx) => void) | undefined }

/**
 * A handler bound to a contract procedure. `TContract` is the contract
 * procedure type it was built from (`typeof contract.planet.find`); `TCtx` is
 * the `$context<C>()` type it expects. Both are phantom. The defaults mean
 * "unbranded": accepted anywhere, and consumers infer `unknown` from them.
 */
export type ImplementedProcedure<TContract = unknown, TCtx = unknown> = {
  readonly '~pf': {
    type: 'implemented-procedure'
    contract: ContractProcedure
    use: MiddlewareFn[]
    useAfter: MiddlewareFn[]
    handler: HandlerFn
    path: string[]
  }
} & ContractBrand<TContract> &
  ContextBrand<TCtx>

/** The implementation tree `impl.router()` expects for contract `T`. */
export type RouterImpl<T, TCtx = unknown> = {
  [K in ContractKeys<T>]: IsContractProcedure<T[K]> extends true
    ? ImplementedProcedure<T[K], TCtx>
    : RouterImpl<T[K], TCtx>
}

declare const contractBrand: unique symbol
declare const contextBrand: unique symbol

type AnyImplementedRouter = {
  readonly [key: string]:
    | ImplementedProcedure
    | AnyImplementedRouter
    | undefined
}

type RouterContractBrand<T> = unknown extends T
  ? {}
  : { readonly [contractBrand]?: T | undefined }

type RouterContextBrand<TCtx> = unknown extends TCtx
  ? {}
  : { readonly [contextBrand]?: ((context: TCtx) => void) | undefined }

/**
 * A finished implementation tree. `T` is the contract and `TCtx` the
 * `$context<C>()` type every procedure in it expects; adapters infer `TCtx`
 * from the context brand (`FetchHandler`, `createLocalClient`, message
 * handlers, Astro). Only this router-level brand is read: a tree not produced
 * by `impl.router()` (a plain object of procedures) infers `unknown` even if
 * its leaves are branded. Both parameters default to `unknown`.
 */
export type ImplementedRouter<T = unknown, TCtx = unknown> = (unknown extends T
  ? AnyImplementedRouter
  : Readonly<RouterImpl<T, TCtx>>) &
  RouterContractBrand<T> &
  RouterContextBrand<TCtx>

// `impl.router(impl)` checks `I & RouterImplCheck<T, TCtx, I>` with `I`
// inferred from the argument, so an error names the offending key instead of
// printing the whole contract. The distributive wrappers drop the alias name
// from error text so the mismatch itself is shown.

/** Contract keys that `I` lacks, each typed as a message literal. */
export type MissingProcedures<T, I> = T extends unknown
  ? {
      [K in ContractKeys<T> as K extends keyof I
        ? IsContractProcedure<T[K]> extends true
          ? never
          : K
        : K]: K extends keyof I
        ? MissingProcedures<T[K], I[K]>
        : `Missing implementation for "${K}"`
    }
  : never

/** Keys of `I` that the contract lacks, each typed as a message literal. */
export type UnexpectedKeys<T, I> = I extends unknown
  ? {
      [K in ContractKeys<I> as K extends ContractKeys<T>
        ? IsContractProcedure<T[K]> extends true
          ? never
          : K
        : K]: K extends ContractKeys<T>
        ? UnexpectedKeys<T[K], I[K]>
        : `"${K}" is not in the contract`
    }
  : never

/** The branded slot type for every contract key that `I` provides. */
export type PresentProcedures<T, TCtx, I> = T extends unknown
  ? {
      [K in ContractKeys<T> as K extends keyof I
        ? K
        : never]: IsContractProcedure<T[K]> extends true
        ? ImplementedProcedure<T[K], TCtx>
        : K extends keyof I
          ? PresentProcedures<T[K], TCtx, I[K]>
          : never
    }
  : never

export type RouterImplCheck<T, TCtx, I> = MissingProcedures<T, I> &
  UnexpectedKeys<T, I> &
  PresentProcedures<T, TCtx, I>

export function isImplementedProcedure(
  value: unknown,
): value is ImplementedProcedure {
  return (
    typeof value === 'object' &&
    value !== null &&
    '~pf' in value &&
    (value as ImplementedProcedure)['~pf']?.type === 'implemented-procedure'
  )
}

export type ProcedureValidation = {
  /** Set false to skip the input schema. Default true. */
  input?: boolean
  /** Set true to check the output schema, including stream output items. Default false. */
  output?: boolean
}

export type RunProcedureOptions = {
  signal?: AbortSignal
  interceptors?: readonly CallInterceptor[]
  validation?: ProcedureValidation
}

/** What one execution of the middleware chain starts from; an interceptor's `next()` may replace any of it. */
type ExecutionState = {
  input: unknown
  context: unknown
  signal?: AbortSignal
}

/**
 * One execution of the `.use()` → input check → `.useAfter()` → handler
 * chain. An interceptor may call `next()` more than once, concurrently
 * (hedging, shadowing), so each run owns its `input` / `ctx` / `signal` here
 * instead of sharing closure variables through `runProcedure`. The chain
 * steps below are module-level functions that take the execution as a
 * parameter, so a run allocates this one object (plus the handler's option
 * bag) rather than a closure per step.
 */
type Execution = {
  def: ImplementedProcedure['~pf']
  errors: ReturnType<typeof createErrorFactory>
  validateInput: boolean
  validateOutput: boolean
  ctx: Record<string, unknown>
  input: unknown
  signal: AbortSignal | undefined
}

export async function runProcedure(
  proc: ImplementedProcedure,
  rawInput: unknown,
  context: unknown,
  options?: RunProcedureOptions,
): Promise<unknown> {
  const def = proc['~pf']
  const errors = createErrorFactory(def.contract['~pf'].errors)
  const validateInput = options?.validation?.input !== false
  const validateOutput = options?.validation?.output === true
  const execute = (state: ExecutionState): Promise<unknown> =>
    runExecution({
      def,
      errors,
      validateInput,
      validateOutput,
      // A copy: middleware `next({ context })` merges into it and must not
      // write through to the caller's object.
      ctx: { ...(state.context as Record<string, unknown>) },
      input: state.input,
      signal: state.signal,
    })

  const initial: ExecutionState = { input: rawInput, context }
  if (options?.signal !== undefined) {
    initial.signal = options.signal
  }
  const interceptors = options?.interceptors
  if (!interceptors?.length) {
    return execute(initial)
  }
  return runCallInterceptors(
    interceptors,
    { procedure: proc, path: def.path, ...initial },
    execute,
  )
}

async function runExecution(run: Execution): Promise<unknown> {
  const map = run.def.contract['~pf'].errors
  try {
    const output = await runUse(run, 0)
    return wrapIfAsyncIterable(output, map)
  } catch (error) {
    return await finalizeDeclaredError(error, map)
  }
}

async function runUse(run: Execution, index: number): Promise<unknown> {
  const mw = run.def.use[index]
  if (!mw) {
    const inputSchema = run.def.contract['~pf'].input
    if (run.validateInput && inputSchema) {
      const result = await validateSchema(inputSchema, run.input)
      if (!result.success) {
        throw new PFError({
          code: 'VALIDATION',
          message: 'Validation failed',
          data: { issues: result.issues },
        })
      }
      run.input = result.value
    }
    return runUseAfter(run, 0)
  }
  return mw({
    context: run.ctx,
    input: run.input,
    errors: run.errors,
    path: run.def.path,
    next: async (opts) => {
      applyNext(run, opts)
      return runUse(run, index + 1)
    },
  })
}

async function runUseAfter(run: Execution, index: number): Promise<unknown> {
  const mw = run.def.useAfter[index]
  if (!mw) {
    return runHandler(run)
  }
  return mw({
    context: run.ctx,
    input: run.input,
    errors: run.errors,
    path: run.def.path,
    next: async (opts) => {
      applyNext(run, opts)
      return runUseAfter(run, index + 1)
    },
  })
}

/** Middleware `next(opts)`: `context` merges into the current one; `input` replaces it. */
function applyNext(
  run: Execution,
  opts: { context?: unknown; input?: unknown } | undefined,
): void {
  if (opts?.context) {
    run.ctx = { ...run.ctx, ...(opts.context as Record<string, unknown>) }
  }
  if (opts && 'input' in opts) {
    run.input = opts.input
  }
}

async function runHandler(run: Execution): Promise<unknown> {
  const handlerOpts: Parameters<HandlerFn>[0] = {
    input: run.input,
    context: run.ctx,
    errors: run.errors,
    path: run.def.path,
  }
  if (run.signal !== undefined) {
    handlerOpts.signal = run.signal
  }
  const output = await run.def.handler(handlerOpts)
  const outputSchema = run.def.contract['~pf'].output
  if (run.validateOutput && outputSchema) {
    const result = await validateSchema(outputSchema, output)
    if (!result.success) {
      // `cause` is for the server log only; `toJSON()` omits it.
      throw new PFError({
        code: 'INTERNAL',
        message: 'Internal server error',
        cause: result.issues,
      })
    }
    return result.value
  }
  return output
}

function wrapIfAsyncIterable(value: unknown, map: ErrorMap): unknown {
  if (!isAsyncIterable(value)) {
    return value
  }
  return wrapAsyncIterable(value, map)
}

function wrapAsyncIterable(
  value: AsyncIterable<unknown>,
  map: ErrorMap,
): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      const it = value[Symbol.asyncIterator]()
      return {
        async next() {
          try {
            return await it.next()
          } catch (error) {
            return await finalizeDeclaredError(error, map)
          }
        },
        async return() {
          return it.return
            ? it.return()
            : { done: true as const, value: undefined }
        },
      }
    },
  }
}

export function lookupProcedure(
  router: ImplementedRouter,
  path: string[],
): ImplementedProcedure | undefined {
  let current: ImplementedProcedure | AnyImplementedRouter | undefined = router
  for (const segment of path) {
    if (!current || isImplementedProcedure(current)) {
      return undefined
    }
    // Own keys only: a path segment such as `constructor` or `__proto__`
    // must not reach `Object.prototype`.
    current = Object.hasOwn(current, segment) ? current[segment] : undefined
  }
  return current && isImplementedProcedure(current) ? current : undefined
}
