/**
 * `true` when `value` can drive `for await`: a non-null object or function
 * whose `Symbol.asyncIterator` is a function. Nothing is excluded — a
 * `ReadableStream` is async-iterable on Node and modern browsers, so a wire
 * site that must treat one as bytes rather than as a stream of items writes
 * that exclusion itself (`isAsyncIterable(x) && !(x instanceof ReadableStream)`).
 */
export function isAsyncIterable(
  value: unknown,
): value is AsyncIterable<unknown> {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    return false
  }
  return (
    typeof (value as { [Symbol.asyncIterator]?: unknown })[
      Symbol.asyncIterator
    ] === 'function'
  )
}
