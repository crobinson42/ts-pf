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
  const result =
    args.length < 2 && (args.length === 0 || isCallOptions(args[0]))
      ? fn({ signal })
      : fn(args[0], { signal })
  if (!isPromiseLike(result)) {
    return result
  }
  return result.then(wrapOutput, (error: unknown) => {
    throw withStatus(error)
  })
}

function wrapOutput(value: unknown): unknown {
  return isAsyncIterable(value) ? wrapIterable(value) : value
}

async function* wrapIterable(
  source: AsyncIterable<unknown>,
): AsyncIterable<unknown> {
  try {
    for await (const item of source) {
      yield item
    }
  } catch (error) {
    throw withStatus(error)
  }
}

// mvc-kit classifies a thrown value by `code` only when `status` is a finite
// number. `PFError.status` is transport metadata: the HTTP response status on
// FetchLink, undefined on message transports, after a stream has started, and
// for declared errors without a status. Hand mvc-kit a copy carrying the HTTP
// default so `errorCode` is the PFError code on every Link. HTTP failures and
// localFailure (status 0) already qualify. The original is never mutated.
const MVC_KIT_DEFAULT_STATUS = 400

function withStatus(error: unknown): unknown {
  if (!isPFErrorLike(error) || Number.isFinite(error.status)) {
    return error
  }
  const copy: unknown = Object.create(
    Object.getPrototypeOf(error),
    Object.getOwnPropertyDescriptors(error),
  )
  Object.defineProperty(copy, 'status', {
    value: MVC_KIT_DEFAULT_STATUS,
    enumerable: true,
    writable: false,
    configurable: true,
  })
  return copy
}

function isPFErrorLike(
  value: unknown,
): value is Error & { code: string; status?: unknown } {
  return (
    value instanceof Error &&
    value.name === 'PFError' &&
    typeof (value as { code?: unknown }).code === 'string'
  )
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[
      Symbol.asyncIterator
    ] === 'function'
  )
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
