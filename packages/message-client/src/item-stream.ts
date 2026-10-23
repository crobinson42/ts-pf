/**
 * Local copy of `isAsyncIterable` from `@ts-pf/protocol` plus the item-stream
 * exclusion the wire packages add on top of it: a `ReadableStream` is
 * async-iterable on Node but carries bytes, not items, so it is sent as a
 * plain JSON value rather than as `in-item` frames. `@ts-pf/message-client`
 * depends on `message` + `client` only (rules.md DAG), so the protocol helper
 * is not imported here.
 */
export function isItemStream(value: unknown): value is AsyncIterable<unknown> {
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
