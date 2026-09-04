import { localFailure } from '@ts-pf/protocol'
import type { CallInterceptor } from './call-interceptor.js'
import type { CallPlugin } from './plugin.js'

export type DedupePluginOptions = {
  key?: (ctx: { path: string[]; input: unknown }) => string | undefined
}

type Waiter = {
  signal: AbortSignal | undefined
}

type InFlight = {
  promise: Promise<unknown>
  ac: AbortController
  waiters: Set<Waiter>
}

export class DedupePlugin implements CallPlugin {
  readonly name = 'dedupe'
  readonly intercept: CallInterceptor
  private readonly keyFn:
    | ((ctx: { path: string[]; input: unknown }) => string | undefined)
    | undefined
  private readonly inflight = new Map<string, InFlight>()

  constructor(options: DedupePluginOptions = {}) {
    this.keyFn = options.key
    this.intercept = (ctx) => this.interceptCall(ctx)
  }

  private interceptCall(
    ctx: Parameters<CallInterceptor>[0],
  ): ReturnType<CallInterceptor> {
    if (isAsyncIterable(ctx.input)) {
      return ctx.next()
    }
    const key = this.resolveKey(ctx)
    if (key === undefined) {
      return ctx.next()
    }
    const existing = this.inflight.get(key)
    if (existing) {
      return this.join(existing, key, ctx.signal) as ReturnType<CallInterceptor>
    }
    if (ctx.signal?.aborted) {
      return Promise.reject(
        localFailure('Request aborted'),
      ) as ReturnType<CallInterceptor>
    }
    const ac = new AbortController()
    const waiters = new Set<Waiter>()
    let entry: InFlight
    // Streaming outputs should be excluded via `key`.
    const promise = ctx.next({ signal: ac.signal }).finally(() => {
      if (this.inflight.get(key) === entry) {
        this.inflight.delete(key)
      }
    })
    entry = { promise, ac, waiters }
    this.inflight.set(key, entry)
    return this.join(entry, key, ctx.signal) as ReturnType<CallInterceptor>
  }

  private resolveKey(ctx: {
    path: string[]
    input: unknown
  }): string | undefined {
    if (this.keyFn) {
      return this.keyFn(ctx)
    }
    return defaultKey(ctx.path, ctx.input)
  }

  private join(
    entry: InFlight,
    key: string,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    if (signal?.aborted) {
      return Promise.reject(localFailure('Request aborted'))
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { signal }
      entry.waiters.add(waiter)
      const onAbort = () => {
        if (!entry.waiters.has(waiter)) {
          return
        }
        entry.waiters.delete(waiter)
        signal?.removeEventListener('abort', onAbort)
        if (entry.waiters.size === 0) {
          if (this.inflight.get(key) === entry) {
            this.inflight.delete(key)
          }
          entry.ac.abort()
        }
        reject(localFailure('Request aborted', signal?.reason))
      }
      if (signal) {
        signal.addEventListener('abort', onAbort)
        if (signal.aborted) {
          onAbort()
          return
        }
      }
      entry.promise.then(
        (value) => {
          if (!entry.waiters.has(waiter)) {
            return
          }
          entry.waiters.delete(waiter)
          signal?.removeEventListener('abort', onAbort)
          resolve(value)
        },
        (error) => {
          if (!entry.waiters.has(waiter)) {
            return
          }
          entry.waiters.delete(waiter)
          signal?.removeEventListener('abort', onAbort)
          reject(error)
        },
      )
    })
  }
}

function defaultKey(path: string[], input: unknown): string | undefined {
  if (isAsyncIterable(input)) {
    return undefined
  }
  try {
    return JSON.stringify([path, input])
  } catch {
    return undefined
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  )
}
