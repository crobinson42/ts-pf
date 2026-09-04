import type { CallInterceptor } from './call-interceptor.js'
import type { CallPlugin } from './plugin.js'

export type DedupePluginOptions = {
  key?: (ctx: { path: string[]; input: unknown }) => string | undefined
}

type Inflight = {
  readonly controller: AbortController
  readonly waiters: Set<object>
  readonly promise: Promise<unknown>
}

function defaultKey(ctx: {
  path: string[]
  input: unknown
}): string | undefined {
  if (
    typeof ctx.input === 'object' &&
    ctx.input !== null &&
    Symbol.asyncIterator in ctx.input
  ) {
    return undefined
  }
  try {
    return JSON.stringify([ctx.path, ctx.input])
  } catch {
    return undefined
  }
}

function joinInflight(
  entry: Inflight,
  inflight: Map<string, Inflight>,
  key: string,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  signal?.throwIfAborted()
  const waiter = {}
  entry.waiters.add(waiter)
  const dropIfLast = () => {
    entry.waiters.delete(waiter)
    if (entry.waiters.size === 0) {
      if (inflight.get(key) === entry) {
        inflight.delete(key)
      }
      entry.controller.abort()
    }
  }
  if (!signal) {
    return entry.promise.finally(() => {
      entry.waiters.delete(waiter)
    })
  }
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (fn: () => void) => {
      if (done) {
        return
      }
      done = true
      signal.removeEventListener('abort', onAbort)
      fn()
    }
    const onAbort = () => {
      finish(() => {
        dropIfLast()
        reject(signal.reason)
      })
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
      return
    }
    entry.promise.then(
      (value) => {
        finish(() => {
          entry.waiters.delete(waiter)
          resolve(value)
        })
      },
      (error) => {
        finish(() => {
          entry.waiters.delete(waiter)
          reject(error)
        })
      },
    )
  })
}

/** In-flight coalescing around runProcedure. Default keys every unary call; pass `key` to restrict to reads — unsafe for non-idempotent writes. */
export class DedupePlugin implements CallPlugin {
  readonly name = 'dedupe'
  readonly intercept: CallInterceptor

  constructor(options?: DedupePluginOptions) {
    const keyFn = options?.key ?? defaultKey
    const byContext = new WeakMap<object, Map<string, Inflight>>()
    const anonymous = new Map<string, Inflight>()

    const bucket = (context: unknown): Map<string, Inflight> => {
      if (typeof context === 'object' && context !== null) {
        let map = byContext.get(context)
        if (!map) {
          map = new Map()
          byContext.set(context, map)
        }
        return map
      }
      return anonymous
    }

    this.intercept = async (ctx) => {
      if (
        typeof ctx.input === 'object' &&
        ctx.input !== null &&
        Symbol.asyncIterator in ctx.input
      ) {
        return ctx.next()
      }
      const key = keyFn({ path: ctx.path, input: ctx.input })
      if (key === undefined) {
        return ctx.next()
      }
      const inflight = bucket(ctx.context)
      const existing = inflight.get(key)
      if (existing) {
        return joinInflight(existing, inflight, key, ctx.signal)
      }
      ctx.signal?.throwIfAborted()
      const controller = new AbortController()
      const waiters = new Set<object>()
      const inner = ctx.next({ signal: controller.signal })
      const entry: Inflight = {
        controller,
        waiters,
        promise: inner.finally(() => {
          if (inflight.get(key) === entry) {
            inflight.delete(key)
          }
        }),
      }
      inflight.set(key, entry)
      return joinInflight(entry, inflight, key, ctx.signal)
    }
  }
}
