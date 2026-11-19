import { isAsyncIterable } from '@ts-pf/protocol'

/**
 * Maps the errors an async iterable throws while it is being iterated.
 * `fn` gets every thrown value and returns the error to throw instead; return
 * the value unchanged to keep it (do that for `PFError`s, so `VALIDATION`
 * failures from `stream()` and errors thrown with `errors.CODE()` reach the
 * client as they are). A value that is not an async iterable is returned
 * unchanged, so one `.use()` middleware covers unary and stream procedures:
 *
 * ```ts no-check
 * impl.use(async ({ next }) => {
 *   try {
 *     return mapStreamErrors(await next(), mapError)
 *   } catch (error) {
 *     throw mapError(error)
 *   }
 * })
 * ```
 *
 * The mapped error still goes through declared-error finalization (its `data`
 * is checked against the contract), because the middleware runs inside the
 * procedure chain. `return()` reaches the source iterator even before the
 * first `next()`, and at most once.
 */
export function mapStreamErrors<T>(
  value: T,
  fn: (error: unknown) => unknown,
): T {
  if (!isAsyncIterable(value)) {
    return value
  }
  return mapIterable(value, fn) as T
}

// Hand-written, not an async generator: a generator's `return()` before its
// first `next()` never reaches the source iterator, so cancelling a stream
// that was never pulled would leak it.
function mapIterable(
  source: AsyncIterable<unknown>,
  fn: (error: unknown) => unknown,
): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      const it = source[Symbol.asyncIterator]()
      let returned = false
      return {
        async next() {
          try {
            return await it.next()
          } catch (error) {
            throw fn(error)
          }
        },
        async return() {
          if (returned || !it.return) {
            return { done: true as const, value: undefined }
          }
          returned = true
          return it.return()
        },
      }
    },
  }
}
