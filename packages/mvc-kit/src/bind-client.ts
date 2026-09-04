import type { CallOptions, ContractClient } from '@ts-pf/contract'

/** Minimal host. Resource, ViewModel, Collection, Trackable, and Service all match. */
export type DisposeSignalHost = {
  readonly disposeSignal: AbortSignal
}

/**
 * Nested `ContractClient<T>` proxy that injects `{ signal: host.disposeSignal }`
 * on every call. Reads the signal at call time (scope-reset renews it).
 * A caller-provided `{ signal }` wins (Pending / offline-kit).
 */
export function bindClient<T>(
  client: ContractClient<T>,
  host: DisposeSignalHost,
): ContractClient<T> {
  return bindNode(client, host) as ContractClient<T>
}

function bindNode(node: unknown, host: DisposeSignalHost): unknown {
  const target = (...args: unknown[]) => {
    if (typeof node !== 'function') {
      throw new TypeError('Not a procedure')
    }
    return invoke(node as (...args: unknown[]) => unknown, args, host)
  }
  const cache = new Map<string, unknown>()
  return new Proxy(target, {
    get(_proxyTarget, prop) {
      if (prop === 'then' || typeof prop === 'symbol') {
        return undefined
      }
      if (typeof prop !== 'string') {
        return undefined
      }
      let child = cache.get(prop)
      if (child === undefined) {
        const next =
          node !== null &&
          (typeof node === 'object' || typeof node === 'function')
            ? (node as Record<string, unknown>)[prop]
            : undefined
        child = bindNode(next, host)
        cache.set(prop, child)
      }
      return child
    },
  })
}

function invoke(
  fn: (...args: unknown[]) => unknown,
  args: unknown[],
  host: DisposeSignalHost,
): unknown {
  const signal = resolveSignal(args, host)
  if (args.length >= 2) {
    return fn(args[0], { signal })
  }
  if (args.length === 0 || isCallOptions(args[0])) {
    return fn({ signal })
  }
  return fn(args[0], { signal })
}

function resolveSignal(args: unknown[], host: DisposeSignalHost): AbortSignal {
  if (args.length >= 2) {
    return userSignal(args[1]) ?? host.disposeSignal
  }
  if (args.length === 1) {
    return userSignal(args[0]) ?? host.disposeSignal
  }
  return host.disposeSignal
}

function userSignal(value: unknown): AbortSignal | undefined {
  return isCallOptions(value) ? value.signal : undefined
}

function isCallOptions(value: unknown): value is CallOptions & {
  signal: AbortSignal
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'signal' in value &&
    (value as CallOptions).signal instanceof AbortSignal
  )
}
