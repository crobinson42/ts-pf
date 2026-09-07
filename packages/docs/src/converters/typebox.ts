import type { JsonSchemaConverter } from '../json-schema.js'

const JSON_SCHEMA_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'null',
  'object',
  'array',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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
    const cloned = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>
    rewriteNamedRefs(cloned)
    assertJsonSchemaTypes(cloned)
    return cloned
  },
}

function rewriteNamedRefs(root: Record<string, unknown>): void {
  const defsKey = isRecord(root.$defs)
    ? '$defs'
    : isRecord(root.definitions)
      ? 'definitions'
      : undefined
  if (defsKey === undefined) {
    return
  }
  const names = new Set(Object.keys(root[defsKey] as Record<string, unknown>))
  rewrite(root, names, defsKey)
}

function rewrite(value: unknown, names: Set<string>, defsKey: string): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      rewrite(item, names, defsKey)
    }
    return
  }
  if (!isRecord(value)) {
    return
  }
  if (typeof value.$ref === 'string' && names.has(value.$ref)) {
    value.$ref = `#/${defsKey}/${escapePointer(value.$ref)}`
  }
  for (const child of Object.values(value)) {
    rewrite(child, names, defsKey)
  }
}

function assertJsonSchemaTypes(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertJsonSchemaTypes(item)
    }
    return
  }
  if (!isRecord(value)) {
    return
  }
  if (typeof value.type === 'string') {
    if (!JSON_SCHEMA_TYPES.has(value.type)) {
      throw new Error(`TypeBox type "${value.type}" is not JSON Schema`)
    }
  } else if (Array.isArray(value.type)) {
    for (const item of value.type) {
      if (typeof item === 'string' && !JSON_SCHEMA_TYPES.has(item)) {
        throw new Error(`TypeBox type "${item}" is not JSON Schema`)
      }
    }
  }
  for (const child of Object.values(value)) {
    assertJsonSchemaTypes(child)
  }
}

function escapePointer(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}
