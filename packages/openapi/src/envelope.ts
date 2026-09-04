import type { CatalogSchema, JsonSchema } from '@ts-pf/docs'

export function innerFromCatalog(
  schema: CatalogSchema | undefined,
): JsonSchema | undefined {
  if (schema === undefined) {
    return undefined
  }
  if (schema.kind === 'json') {
    return schema.jsonSchema
  }
  if (schema.kind === 'unavailable') {
    return { description: `Schema unavailable: ${schema.reason}` }
  }
  if (schema.kind === 'stream') {
    return innerFromCatalog(schema.item) ?? {}
  }
  return undefined
}

export function requestEnvelope(input?: JsonSchema): JsonSchema {
  if (input === undefined) {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        input: { type: 'null' },
      },
    }
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['input'],
    properties: {
      input,
    },
  }
}

export function successEnvelope(output?: JsonSchema): JsonSchema {
  const properties: Record<string, unknown> = {
    ok: { const: true },
  }
  const required = ['ok']
  if (output !== undefined) {
    properties.output = output
    required.push('output')
  }
  return {
    type: 'object',
    additionalProperties: false,
    required,
    properties,
  }
}

export function failureEnvelope(code: string, data?: JsonSchema): JsonSchema {
  const properties: Record<string, unknown> = {
    code: { const: code },
    message: { type: 'string' },
  }
  const required = ['code', 'message']
  if (data !== undefined) {
    properties.data = data
    required.push('data')
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'error'],
    properties: {
      ok: { const: false },
      error: {
        type: 'object',
        additionalProperties: false,
        required,
        properties,
      },
    },
  }
}
