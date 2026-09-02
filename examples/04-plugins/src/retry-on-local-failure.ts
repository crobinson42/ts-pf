import type { Interceptor } from '@ts-pf/client'

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/** One retry on a thrown fetch. Interceptors see raw transport throws, not mapped PFError. */
export const retryOnLocalFailure: Interceptor = async ({ request, next }) => {
  const retryable = request.clone()
  try {
    return await next(request)
  } catch (error) {
    if (isAbortError(error) || request.signal.aborted) {
      throw error
    }
    return next(retryable)
  }
}
