import type { ErrorDef, InferErrorData } from '@ts-pf/contract'

declare const addedContext: unique symbol

/**
 * What `next()` resolves to: the chain's output, carrying the context keys
 * this middleware added as a phantom type. `impl.use(mw)` reads them from the
 * middleware's return type, so the handler sees them. At runtime it is the
 * output itself.
 */
export type MiddlewareResult<TAdded, TOutput> = unknown extends TOutput
  ? { readonly [addedContext]?: TAdded } | null | undefined
  : TOutput & { readonly [addedContext]?: TAdded }

/**
 * Continues the middleware chain. `next({ context })` **merges** into the
 * current context (`{ ...ctx, ...added }`), and the added keys are typed for
 * later middleware and the handler. A key `TCtx` already has may be narrowed
 * (`user?: User` → `user: User`) but not given another type. `next({ input })`
 * replaces the input. Compare `CallInterceptor`'s `next()`, which replaces
 * `context` entirely.
 */
export type NextFn<TCtx, TInput, TOutput> = <
  TAdded extends object = {},
>(opts?: {
  /** Merged into the current context; its keys are typed downstream. */
  context?: TAdded & { [K in keyof TAdded & keyof TCtx]?: TCtx[K] }
  /** Replaces the input for the rest of the chain. */
  input?: TInput
}) => Promise<MiddlewareResult<NoInfer<TAdded>, TOutput>>

/**
 * A middleware. `TCtx` is the context it reads; `TAdded` is what it passes to
 * `next({ context })`, which later middleware and the handler see. Return the
 * result of `next()` (or a value derived from it) so `TAdded` is inferred.
 */
export type MiddlewareFn<
  TCtx = unknown,
  TAdded extends object = {},
  TInput = unknown,
  TOutput = unknown,
> = (opts: {
  context: TCtx
  input: TInput
  next: NextFn<TCtx, TInput, TOutput>
  errors: ErrorFactory
  path: string[]
}) => Promise<MiddlewareResult<TAdded, TOutput>>

/** `TCtx` after a middleware's `next({ context: TAdded })`: added keys override. */
export type MergeContext<TCtx, TAdded> = [keyof TAdded] extends [never]
  ? TCtx
  : Omit<TCtx, keyof TAdded> & TAdded

export type ErrorFactory<
  E extends Record<string, unknown> = Record<string, unknown>,
> = string extends keyof E
  ? { [K in keyof E]: (data?: unknown) => never }
  : {
      [K in keyof E]: [InferErrorData<Extract<E[K], ErrorDef>>] extends [never]
        ? () => never
        : (data: InferErrorData<Extract<E[K], ErrorDef>>) => never
    }
