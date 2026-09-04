import type { StandardSchemaV1 } from '@standard-schema/spec'
import { type InferSchemaOutput, validateSchema } from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import { isAsyncIterable } from './is-async-iterable.js'

export function stream<S>(
  item: S,
): StandardSchemaV1<
  AsyncIterable<InferSchemaOutput<S>>,
  AsyncIterable<InferSchemaOutput<S>>
> {
  const schema: StandardSchemaV1<
    AsyncIterable<InferSchemaOutput<S>>,
    AsyncIterable<InferSchemaOutput<S>>
  > & { '~pfStream': { item: S } } = {
    '~standard': {
      version: 1,
      vendor: 'ts-pf',
      types: {
        input: 0 as unknown as AsyncIterable<InferSchemaOutput<S>>,
        output: 0 as unknown as AsyncIterable<InferSchemaOutput<S>>,
      },
      validate: async (value) => {
        if (!isAsyncIterable(value)) {
          return { issues: [{ message: 'Expected an async iterable' }] }
        }
        return { value: wrap(value, item) }
      },
    },
    '~pfStream': { item },
  }
  return schema
}

async function* wrap<S>(
  value: AsyncIterable<unknown>,
  item: S,
): AsyncIterable<InferSchemaOutput<S>> {
  for await (const entry of value) {
    const result = await validateSchema<InferSchemaOutput<S>>(item, entry)
    if (!result.success) {
      throw new PFError({
        code: 'VALIDATION',
        status: 422,
        message: 'Validation failed',
        data: { issues: result.issues },
      })
    }
    yield result.value
  }
}
