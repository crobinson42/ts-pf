import type { CallOptions, ContractClient } from '@ts-pf/contract'
import type { CallInterceptor } from './call-interceptor.js'
import { intercept } from './intercept.js'
import type { Link } from './link.js'
import type { CallPlugin } from './plugin.js'

export function createClient<T>(
  link: Link,
  options?: {
    interceptors?: readonly CallInterceptor[]
    plugins?: readonly CallPlugin[]
  },
): ContractClient<T> {
  const resolved = intercept(link, options)
  const create = (path: string[]): unknown =>
    new Proxy(
      (...args: unknown[]) => {
        const { input, signal } = splitCallArgs(args)
        return signal
          ? resolved.call(path, input, signal)
          : resolved.call(path, input)
      },
      {
        get(_, key) {
          if (key === 'then' || typeof key === 'symbol') {
            return undefined
          }
          return create([...path, String(key)])
        },
      },
    )
  return create([]) as ContractClient<T>
}

function splitCallArgs(args: unknown[]): {
  input: unknown
  signal?: AbortSignal
} {
  if (args.length >= 2) {
    const opts = args[1] as CallOptions | undefined
    return opts?.signal
      ? { input: args[0], signal: opts.signal }
      : { input: args[0] }
  }
  const first = args[0]
  if (isCallOptions(first)) {
    return first.signal
      ? { input: undefined, signal: first.signal }
      : { input: undefined }
  }
  return { input: first }
}

function isCallOptions(value: unknown): value is CallOptions {
  return (
    typeof value === 'object' &&
    value !== null &&
    'signal' in value &&
    (value as CallOptions).signal instanceof AbortSignal
  )
}
