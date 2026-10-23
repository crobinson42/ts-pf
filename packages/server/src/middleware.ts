import type { ErrorDef, InferErrorData } from '@ts-pf/contract'

/**
 * Continues the middleware chain. `next({ context })` **merges** into the
 * current context (`{ ...ctx, ...added }`); `next({ input })` replaces the
 * input. Compare `CallInterceptor`'s `next()`, which replaces `context`
 * entirely.
 */
export type NextFn<TCtx, TInput, TOutput> = (opts?: {
  /** Merged into the current context; added keys are not inferred. */
  context?: Partial<TCtx>
  /** Replaces the input for the rest of the chain. */
  input?: TInput
}) => Promise<TOutput>

export type MiddlewareFn<
  TCtx = unknown,
  TInput = unknown,
  TOutput = unknown,
> = (opts: {
  context: TCtx
  input: TInput
  next: NextFn<TCtx, TInput, TOutput>
  errors: ErrorFactory
  path: string[]
}) => Promise<TOutput>

export type ErrorFactory<
  E extends Record<string, unknown> = Record<string, unknown>,
> = string extends keyof E
  ? { [K in keyof E]: (data?: unknown) => never }
  : {
      [K in keyof E]: [InferErrorData<Extract<E[K], ErrorDef>>] extends [never]
        ? () => never
        : (data: InferErrorData<Extract<E[K], ErrorDef>>) => never
    }
