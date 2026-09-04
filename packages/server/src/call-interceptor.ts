import type { ImplementedProcedure } from './runtime.js'

export type CallInterceptor = (ctx: {
  procedure: ImplementedProcedure
  path: string[]
  input: unknown
  context: unknown
  signal?: AbortSignal
  next: (opts?: {
    input?: unknown
    /** Replaces context entirely; does not merge. */
    context?: unknown
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
      ...(current.signal ? { signal: current.signal } : {}),
      next: (opts) => {
        const nextCurrent: CallState = {
          input: opts && 'input' in opts ? opts.input : current.input,
          context: opts && 'context' in opts ? opts.context : current.context,
        }
        if (opts && 'signal' in opts) {
          if (opts.signal) {
            nextCurrent.signal = opts.signal
          }
        } else if (current.signal) {
          nextCurrent.signal = current.signal
        }
        return run(index + 1, nextCurrent)
      },
    })
  }

  const initial: CallState = {
    input: ctx.input,
    context: ctx.context,
  }
  if (ctx.signal) {
    initial.signal = ctx.signal
  }
  return run(0, initial)
}
