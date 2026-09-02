export function isAsyncIterable(
  value: unknown,
): value is AsyncIterable<unknown> {
  if (
    typeof ReadableStream !== 'undefined' &&
    value instanceof ReadableStream
  ) {
    return false
  }
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
      'function'
  )
}
