import type { CallInterceptor, CallPlugin } from '@ts-pf/client'

/** Userland timeout: `next` cannot change path, so abort via `signal`. */
export class TimeoutPlugin implements CallPlugin {
  readonly name = 'timeout'
  readonly intercept: CallInterceptor

  constructor(ms: number) {
    this.intercept = (ctx) => {
      if (isAsyncIterable(ctx.input)) {
        return ctx.next()
      }
      const signal = mergeAbort(ctx.signal, AbortSignal.timeout(ms))
      return ctx.next({ signal })
    }
  }
}

function mergeAbort(
  user: AbortSignal | undefined,
  timeout: AbortSignal,
): AbortSignal {
  if (!user) {
    return timeout
  }
  if (user.aborted) {
    return user
  }
  if (timeout.aborted) {
    return timeout
  }
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  user.addEventListener('abort', onAbort, { once: true })
  timeout.addEventListener('abort', onAbort, { once: true })
  return controller.signal
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  )
}
