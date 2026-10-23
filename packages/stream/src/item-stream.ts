import { isAsyncIterable } from '@ts-pf/protocol'

/**
 * An async iterable of envelope items. A `ReadableStream` is async-iterable
 * on Node but carries bytes, not items, so it is never framed as JSONL; it
 * stays a plain value for the inner codec, as before.
 */
export function isItemStream(value: unknown): value is AsyncIterable<unknown> {
  return (
    isAsyncIterable(value) &&
    !(typeof ReadableStream !== 'undefined' && value instanceof ReadableStream)
  )
}
