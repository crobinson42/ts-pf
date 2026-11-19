import type { JsonSchema } from '@ts-pf/docs'
import type { Side } from './normalize.js'
import type { OpenAPIDocument } from './types.js'

const COMPONENT_REF = /^#\/components\/schemas\/([^/]+)(.*)$/

/**
 * Replaces every schema root in the document with `map(root, side)`:
 * component schemas and parameter schemas (no side), then each operation's
 * request bodies (`'input'`) and response headers and bodies (`'output'`).
 */
export function mapDocumentSchemas(
  document: OpenAPIDocument,
  map: (schema: JsonSchema, side: Side | undefined) => JsonSchema,
): void {
  const { schemas, parameters } = document.components
  for (const [name, schema] of Object.entries(schemas)) {
    schemas[name] = map(schema, undefined)
  }
  for (const parameter of Object.values(parameters ?? {})) {
    if (parameter.schema !== undefined) {
      parameter.schema = map(parameter.schema, undefined)
    }
  }
  for (const item of Object.values(document.paths)) {
    const operation = item.post
    if (operation === undefined) {
      continue
    }
    for (const media of Object.values(operation.requestBody?.content ?? {})) {
      if (media.schema !== undefined) {
        media.schema = map(media.schema, 'input')
      }
    }
    for (const response of Object.values(operation.responses)) {
      for (const header of Object.values(response.headers ?? {})) {
        if (header.schema !== undefined) {
          header.schema = map(header.schema, 'output')
        }
      }
      for (const media of Object.values(response.content ?? {})) {
        if (media.schema !== undefined) {
          media.schema = map(media.schema, 'output')
        }
      }
    }
  }
}

/** `#/components/schemas/<name>…` → the component name and the rest. */
export function componentTarget(
  ref: unknown,
): { name: string; rest: string } | undefined {
  if (typeof ref !== 'string') {
    return undefined
  }
  const match = COMPONENT_REF.exec(ref)
  if (match === null) {
    return undefined
  }
  return { name: match[1] ?? '', rest: match[2] ?? '' }
}

/** Follows whole-component `$ref`s from `schema` to the schema they name. */
export function resolveComponent(
  schemas: Record<string, JsonSchema>,
  schema: JsonSchema,
): JsonSchema | undefined {
  let current: JsonSchema | undefined = schema
  const seen = new Set<string>()
  while (current !== undefined) {
    const target = componentTarget(current.$ref)
    if (target === undefined || target.rest !== '') {
      return current
    }
    if (seen.has(target.name)) {
      return undefined
    }
    seen.add(target.name)
    current = schemas[target.name]
  }
  return undefined
}
