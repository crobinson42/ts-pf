import type { JsonSchema } from '@ts-pf/docs'

// Keywords whose values are subschemas. Everything else (`const`, `enum`,
// `default`, `examples`, …) is data and is never visited.
const SCHEMA_MAPS = new Set([
  'properties',
  'patternProperties',
  'dependentSchemas',
  '$defs',
  'definitions',
])
const SCHEMA_LISTS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems'])
const SCHEMA_ONE = new Set([
  'items',
  'additionalItems',
  'additionalProperties',
  'unevaluatedItems',
  'unevaluatedProperties',
  'propertyNames',
  'contains',
  'not',
  'if',
  'then',
  'else',
  'contentSchema',
])

function isSchemaObject(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Copies a JSON Schema bottom-up, passing every schema object (children
 * first) through `visit`. Boolean schemas and data keywords are copied as is.
 */
export function mapSchema(
  schema: unknown,
  visit: (node: JsonSchema) => JsonSchema,
): unknown {
  if (!isSchemaObject(schema)) {
    return schema
  }
  const node: JsonSchema = {}
  for (const [key, value] of Object.entries(schema)) {
    node[key] = mapKeyword(key, value, visit)
  }
  return visit(node)
}

function mapKeyword(
  key: string,
  value: unknown,
  visit: (node: JsonSchema) => JsonSchema,
): unknown {
  if (SCHEMA_MAPS.has(key) && isSchemaObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([name, child]) => [
        name,
        mapSchema(child, visit),
      ]),
    )
  }
  if ((SCHEMA_LISTS.has(key) || SCHEMA_ONE.has(key)) && Array.isArray(value)) {
    return value.map((child) => mapSchema(child, visit))
  }
  if (SCHEMA_ONE.has(key)) {
    return mapSchema(value, visit)
  }
  return value
}
