import { defined } from '@ts-pf/protocol'
import type { ImplementedProcedure } from './runtime.js'

/**
 * Wraps one `runProcedure` call. Interceptors run in array order with `[0]`
 * outermost (`applyPlugins` puts plugin interceptors before loose ones).
 * `next(opts)` **replaces** whatever it is given — `input`, `context`, and
 * `signal` each overwrite the current value for everything inside, and a key
 * that is passed as `undefined` clears it. Compare middleware `next()`
 * (`NextFn` in `middleware.ts`), which merges `context` into the current one.
 */
export type CallInterceptor = (ctx: {
  procedure: ImplementedProcedure
  path: string[]
  input: unknown
  context: unknown
  signal?: AbortSignal
  next: (opts?: {
    /** Replaces the input for everything inside this interceptor. */
    input?: unknown
    /** Replaces context entirely; does not merge. */
    context?: unknown
    /** Replaces the signal; passing `undefined` removes it. */
    signal?: AbortSignal
  }) => Promise<unknown>
}) => Promise<unknown>

type CallState = {
  input: unknown
  context: unknown
  signal?: AbortSignal
}

export function runCallInterceptors(
  interceptors: readonly CallInterceptor[],
  ctx: {
    procedure: ImplementedProcedure
    path: string[]
    input: unknown
    context: unknown
    signal?: AbortSignal
  },
  execute: (current: CallState) => Promise<unknown>,
): Promise<unknown> {
  const interceptorPath = ctx.path.slice()
  const run = (index: number, current: CallState): Promise<unknown> => {
    const interceptor = interceptors[index]
    if (!interceptor) {
      return execute(current)
    }
    return interceptor({
      procedure: ctx.procedure,
      path: interceptorPath,
      input: current.input,
      context: current.context,
      ...defined({ signal: current.signal }),
      next: (opts) => {
        const nextCurrent: CallState = {
          input: opts && 'input' in opts ? opts.input : current.input,
          context: opts && 'context' in opts ? opts.context : current.context,
          ...defined({
            signal: opts && 'signal' in opts ? opts.signal : current.signal,
          }),
        }
        return run(index + 1, nextCurrent)
      },
    })
  }

  return run(0, {
    input: ctx.input,
    context: ctx.context,
    ...defined({ signal: ctx.signal }),
  })
}
