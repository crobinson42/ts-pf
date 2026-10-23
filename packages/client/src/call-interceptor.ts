import type { PFError, PFResultPromise } from '@ts-pf/protocol'

/**
 * Wraps `Link.call`. `[0]` is outermost. `next(opts)` **replaces** `input` and
 * `signal` for the rest of the chain (it does not merge); `path` cannot be
 * changed. Mirrors the server `CallInterceptor` (duplicated on purpose; the
 * two packages do not import each other).
 */
export type CallInterceptor = (ctx: {
  path: string[]
  input: unknown
  signal?: AbortSignal
  next: (opts?: {
    input?: unknown
    signal?: AbortSignal
  }) => PFResultPromise<unknown, PFError>
}) => PFResultPromise<unknown, PFError>

export function runCallInterceptors(
  interceptors: readonly CallInterceptor[],
  path: string[],
  input: unknown,
  signal: AbortSignal | undefined,
  send: (
    input: unknown,
    signal: AbortSignal | undefined,
  ) => PFResultPromise<unknown, PFError>,
): PFResultPromise<unknown, PFError> {
  const interceptorPath = path.slice()
  const run = (
    index: number,
    currentInput: unknown,
    currentSignal: AbortSignal | undefined,
  ): PFResultPromise<unknown, PFError> => {
    const interceptor = interceptors[index]
    if (!interceptor) {
      return send(currentInput, currentSignal)
    }
    return interceptor({
      path: interceptorPath,
      input: currentInput,
      ...(currentSignal ? { signal: currentSignal } : {}),
      next: (opts) => {
        const nextInput = opts && 'input' in opts ? opts.input : currentInput
        const nextSignal =
          opts && 'signal' in opts ? opts.signal : currentSignal
        return run(index + 1, nextInput, nextSignal)
      },
    })
  }
  return run(0, input, signal)
}
