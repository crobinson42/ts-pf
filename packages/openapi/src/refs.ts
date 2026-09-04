import type { JsonSchema } from '@ts-pf/docs'

export function relocateRefs(
  schema: JsonSchema,
  componentName: string,
): JsonSchema {
  const prefix = `#/components/schemas/${componentName}`
  return walk(schema, prefix) as JsonSchema
}

function walk(value: unknown, prefix: string): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => walk(entry, prefix))
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(obj)) {
    if (
      (key === '$ref' || key === '$dynamicRef') &&
      typeof child === 'string' &&
      child.startsWith('#')
    ) {
      out[key] = rewriteRef(child, prefix)
    } else {
      out[key] = walk(child, prefix)
    }
  }
  return out
}

function rewriteRef(ref: string, prefix: string): string {
  if (ref.startsWith('#/components/')) {
    return ref
  }
  if (ref === '#') {
    return prefix
  }
  if (ref.startsWith('#/')) {
    return `${prefix}${ref.slice(1)}`
  }
  return ref
}

export function putSchema(
  schemas: Record<string, JsonSchema>,
  name: string,
  schema: JsonSchema,
): JsonSchema {
  schemas[name] = relocateRefs(schema, name)
  return { $ref: `#/components/schemas/${name}` }
}
