export type NextFn<TCtx, TInput, TOutput> = (opts?: {
  context?: Partial<TCtx>
  input?: TInput
}) => Promise<TOutput>

export type MiddlewareFn<TCtx = unknown, TInput = unknown, TOutput = unknown> = (opts: {
  context: TCtx
  input: TInput
  next: NextFn<TCtx, TInput, TOutput>
  errors: ErrorFactory
  path: string[]
}) => Promise<TOutput>

export type ErrorFactory<E extends Record<string, unknown> = Record<string, unknown>> = {
  [K in keyof E]: (data?: unknown) => never
}
