import type { JsonSchemaConverter } from '../json-schema.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

type JsonSchemaFn = (opts: { target: string }) => Record<string, unknown>

export const standardJsonSchemaConverter: JsonSchemaConverter = {
  vendor: 'standard-json-schema',
  accept(schema) {
    if (!isRecord(schema) || !('~standard' in schema)) {
      return false
    }
    const standard = schema['~standard']
    if (!isRecord(standard) || !isRecord(standard.jsonSchema)) {
      return false
    }
    return (
      typeof standard.jsonSchema.input === 'function' &&
      typeof standard.jsonSchema.output === 'function'
    )
  },
  convert(schema, options) {
    const standard = (
      schema as {
        '~standard': {
          jsonSchema: {
            input: JsonSchemaFn
            output: JsonSchemaFn
          }
        }
      }
    )['~standard']
    const fn =
      options.io === 'input'
        ? standard.jsonSchema.input
        : standard.jsonSchema.output
    return fn({ target: options.target ?? 'draft-2020-12' })
  },
}
