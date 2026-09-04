import { localFailure } from '@ts-pf/protocol'
import type { CallInterceptor } from './call-interceptor.js'
import { isLocalFailure } from './is-local-failure.js'
import type { CallPlugin } from './plugin.js'

export type RetryPluginOptions = {
  retries?: number
  delay?: number | ((attempt: number, error: unknown) => number)
  retry?: (error: unknown, attempt: number) => boolean
}

export class RetryPlugin implements CallPlugin {
  readonly name = 'retry'
  readonly intercept: CallInterceptor
  private readonly retries: number
  private readonly delay: number | ((attempt: number, error: unknown) => number)
  private readonly shouldRetry: (error: unknown, attempt: number) => boolean

  constructor(options: RetryPluginOptions = {}) {
    this.retries = options.retries ?? 3
    this.delay = options.delay ?? 0
    this.shouldRetry = options.retry ?? isLocalFailure
    this.intercept = (ctx) => this.interceptCall(ctx)
  }

  private async interceptCall(
    ctx: Parameters<CallInterceptor>[0],
  ): Promise<unknown> {
    if (isAsyncIterable(ctx.input)) {
      return ctx.next()
    }
    let attempt = 0
    for (;;) {
      if (attempt > 0 && ctx.signal?.aborted) {
        throw localFailure('Request aborted', ctx.signal.reason)
      }
      try {
        return await ctx.next()
      } catch (error) {
        if (ctx.signal?.aborted) {
          throw error
        }
        attempt += 1
        if (attempt > this.retries || !this.shouldRetry(error, attempt)) {
          throw error
        }
        const ms =
          typeof this.delay === 'function'
            ? this.delay(attempt, error)
            : this.delay
        await wait(ms, ctx.signal)
      }
    }
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  )
}

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(localFailure('Request aborted', signal.reason))
  }
  if (ms <= 0) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      finish(() => resolve())
    }, ms)
    const onAbort = () => {
      finish(() => reject(localFailure('Request aborted', signal?.reason)))
    }
    const finish = (fn: () => void) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      fn()
    }
    if (!signal) {
      return
    }
    signal.addEventListener('abort', onAbort)
    if (signal.aborted) {
      onAbort()
    }
  })
}
