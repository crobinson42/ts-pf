import type { ErrorDef, InferErrorData } from '@ts-pf/contract'

export type NextFn<TCtx, TInput, TOutput> = (opts?: {
  context?: Partial<TCtx>
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
