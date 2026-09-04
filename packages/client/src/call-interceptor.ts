import type { PFError, PFResultPromise } from '@ts-pf/protocol'

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
