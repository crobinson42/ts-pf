import type { CallOptions, ContractClient } from '@ts-pf/contract'
import type { CallInterceptor } from './call-interceptor.js'
import { intercept } from './intercept.js'
import type { Link } from './link.js'
import type { CallPlugin } from './plugin.js'

type CreateClientOptions = {
  interceptors?: readonly CallInterceptor[]
  plugins?: readonly CallPlugin[]
}

/**
 * Typed client over a `Link`. Pass the contract type:
 * `createClient<typeof contract>(link)`. Without it `T` is `never` and the
 * result is a single `~error` member naming the fix, instead of a silent `{}`.
 */
export function createClient<T = never>(
  link: Link,
  options?: CreateClientOptions,
): [T] extends [never]
  ? { readonly '~error': 'Pass createClient<typeof contract>(link)' }
  : ContractClient<T>
export function createClient(
  link: Link,
  options?: CreateClientOptions,
): unknown {
  const resolved = intercept(link, options)
  // Each node caches its children, so `client.planet.find(...)` walks two
  // existing proxies per call instead of building two.
  const create = (path: string[]): unknown => {
    const children = new Map<string, unknown>()
    return new Proxy((...args: unknown[]) => call(resolved, path, args), {
      get(_, key) {
        if (key === 'then' || typeof key === 'symbol') {
          return undefined
        }
        const name = String(key)
        let child = children.get(name)
        if (child === undefined) {
          child = create([...path, name])
          children.set(name, child)
        }
        return child
      },
    })
  }
  return create([])
}

/** `(input, opts?)`, or `(opts)` alone when the procedure takes no input. */
function call(link: Link, path: string[], args: unknown[]): unknown {
  if (args.length >= 2) {
    const opts = args[1] as CallOptions | undefined
    return opts?.signal
      ? link.call(path, args[0], opts.signal)
      : link.call(path, args[0])
  }
  const first = args[0]
  if (isCallOptions(first)) {
    return first.signal
      ? link.call(path, undefined, first.signal)
      : link.call(path, undefined)
  }
  return link.call(path, first)
}

function isCallOptions(value: unknown): value is CallOptions {
  return (
    typeof value === 'object' &&
    value !== null &&
    'signal' in value &&
    (value as CallOptions).signal instanceof AbortSignal
  )
}
