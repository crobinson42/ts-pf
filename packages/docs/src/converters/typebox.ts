import type { JsonSchemaConverter } from '../json-schema.js'

export const typeboxJsonSchemaConverter: JsonSchemaConverter = {
  vendor: 'typebox',
  accept(schema) {
    return (
      typeof schema === 'object' &&
      schema !== null &&
      '~kind' in schema &&
      typeof (schema as { '~kind': unknown })['~kind'] === 'string'
    )
  },
  convert(schema) {
    return JSON.parse(JSON.stringify(schema)) as Record<string, unknown>
  },
}
