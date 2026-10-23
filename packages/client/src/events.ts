import type { CallInterceptor } from './call-interceptor.js'

type EventCtx = {
  path: string[]
  input: unknown
  signal?: AbortSignal
}

/** The interceptor ctx minus `next`; `signal` is set only when present. */
function eventCtx(ctx: EventCtx): EventCtx {
  const out: EventCtx = { path: ctx.path, input: ctx.input }
  if (ctx.signal !== undefined) {
    out.signal = ctx.signal
  }
  return out
}

export function onStart(
  fn: (ctx: {
    path: string[]
    input: unknown
    signal?: AbortSignal
  }) => void | Promise<void>,
): CallInterceptor {
  return async (ctx) => {
    await fn(eventCtx(ctx))
    return ctx.next()
  }
}

export function onSuccess(
  fn: (
    ctx: { path: string[]; input: unknown; signal?: AbortSignal },
    output: unknown,
  ) => void | Promise<void>,
): CallInterceptor {
  return async (ctx) => {
    const output = await ctx.next()
    await fn(eventCtx(ctx), output)
    return output
  }
}

export function onError(
  fn: (
    ctx: { path: string[]; input: unknown; signal?: AbortSignal },
    error: unknown,
  ) => void | Promise<void>,
): CallInterceptor {
  return async (ctx) => {
    try {
      return await ctx.next()
    } catch (error) {
      try {
        await fn(eventCtx(ctx), error)
      } catch {
        // Observe-only: always rethrow the original call error.
      }
      throw error
    }
  }
}

export function onFinish(
  fn: (
    ctx: { path: string[]; input: unknown; signal?: AbortSignal },
    result: { ok: true; output: unknown } | { ok: false; error: unknown },
  ) => void | Promise<void>,
): CallInterceptor {
  return async (ctx) => {
    let output: unknown
    try {
      output = await ctx.next()
    } catch (error) {
      try {
        await fn(eventCtx(ctx), { ok: false, error })
      } catch {
        // Always rethrow the original call error.
      }
      throw error
    }
    await fn(eventCtx(ctx), { ok: true, output })
    return output
  }
}
