import type { StandardSchemaV1 } from '@standard-schema/spec'
import {
  type InferSchemaInput,
  type InferSchemaOutput,
  validateSchema,
} from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import { isItemStream } from './item-stream.js'

/**
 * A stream of `item`s. The sender's items are the item schema's input type;
 * after the per-item check (a validated input stream) they are its output.
 */
export function stream<S>(
  item: S,
): StandardSchemaV1<
  AsyncIterable<InferSchemaInput<S>>,
  AsyncIterable<InferSchemaOutput<S>>
> {
  const schema: StandardSchemaV1<
    AsyncIterable<InferSchemaInput<S>>,
    AsyncIterable<InferSchemaOutput<S>>
  > & { '~pfStream': { item: S } } = {
    '~standard': {
      version: 1,
      vendor: 'ts-pf',
      types: {
        input: 0 as unknown as AsyncIterable<InferSchemaInput<S>>,
        output: 0 as unknown as AsyncIterable<InferSchemaOutput<S>>,
      },
      validate: async (value) => {
        if (!isItemStream(value)) {
          return { issues: [{ message: 'Expected an async iterable' }] }
        }
        return { value: wrap(value, item) }
      },
    },
    '~pfStream': { item },
  }
  return schema
}

/**
 * Validates each item on `next()`. Hand-written, not an async generator: a
 * generator's `return()` before its first `next()` completes it without
 * running its body, so it would never reach the inner iterator. This one
 * forwards `return()` to the inner iterator, which is how a cancel reaches
 * the handler's stream even when nothing was pulled yet.
 */
function wrap<S>(
  value: AsyncIterable<unknown>,
  item: S,
): AsyncIterable<InferSchemaOutput<S>> {
  return {
    [Symbol.asyncIterator]() {
      const it = value[Symbol.asyncIterator]()
      return {
        async next() {
          const next = await it.next()
          if (next.done) {
            return { done: true, value: undefined }
          }
          const result = await validateSchema<InferSchemaOutput<S>>(
            item,
            next.value,
          )
          if (!result.success) {
            // Like `for await` leaving on a throw: close the source first.
            await closeQuietly(it)
            throw new PFError({
              code: 'VALIDATION',
              status: 422,
              message: 'Validation failed',
              data: { issues: result.issues },
            })
          }
          return { done: false, value: result.value }
        },
        async return() {
          await it.return?.()
          return { done: true, value: undefined }
        },
      }
    },
  }
}

/** The validation error is what the caller sees; a failing `return()` is not. */
async function closeQuietly(it: AsyncIterator<unknown>): Promise<void> {
  try {
    await it.return?.()
  } catch {
    // Keep the validation error.
  }
}
