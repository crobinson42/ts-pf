import type { JsonSchema } from '@ts-pf/docs'
import { mapDocumentSchemas, resolveComponent } from './document.js'
import type { OpenAPIDocument } from './types.js'
import { forEachSchema, isSchemaObject, mapSchema } from './walk.js'

/**
 * `constAsEnum: 'exceptTags'`: rewrite `const: v` as `enum: [v]`, except on
 * discriminator tags, which generators read from `const`.
 */
export function constAsEnum(document: OpenAPIDocument): void {
  const tags = tagSchemas(document)
  mapDocumentSchemas(
    document,
    (schema) =>
      mapSchema(schema, (node, source) =>
        Object.hasOwn(node, 'const') && !tags.has(source)
          ? constToEnum(node)
          : node,
      ) as JsonSchema,
  )
}

/**
 * The property schemas that tag a union: in a `oneOf` / `anyOf` of two or
 * more objects (after following `$ref`s), a property that has a `const` in
 * every variant, with a different value in each.
 */
function tagSchemas(document: OpenAPIDocument): Set<JsonSchema> {
  const { schemas } = document.components
  const tags = new Set<JsonSchema>()
  mapDocumentSchemas(document, (root) => {
    forEachSchema(root, (node) => {
      for (const key of ['oneOf', 'anyOf'] as const) {
        const variants = node[key]
        if (Array.isArray(variants) && variants.length > 1) {
          for (const tag of unionTags(variants, schemas)) {
            tags.add(tag)
          }
        }
      }
    })
    return root
  })
  return tags
}

function unionTags(
  variants: unknown[],
  schemas: Record<string, JsonSchema>,
): JsonSchema[] {
  const objects: Record<string, unknown>[] = []
  for (const variant of variants) {
    const resolved = isSchemaObject(variant)
      ? resolveComponent(schemas, variant)
      : undefined
    if (resolved === undefined || !isSchemaObject(resolved.properties)) {
      return []
    }
    objects.push(resolved.properties)
  }
  const tags: JsonSchema[] = []
  for (const name of Object.keys(objects[0] ?? {})) {
    const props = objects.map((properties) => properties[name])
    if (!props.every(hasConst)) {
      continue
    }
    const values = new Set(props.map((prop) => JSON.stringify(prop.const)))
    if (values.size === props.length) {
      tags.push(...props)
    }
  }
  return tags
}

function hasConst(value: unknown): value is JsonSchema & { const: unknown } {
  return isSchemaObject(value) && Object.hasOwn(value, 'const')
}

/** `{ type, const: v, … }` → `{ type, enum: [v], … }`, keeping key order. */
function constToEnum(node: JsonSchema): JsonSchema {
  const out: JsonSchema = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === 'const') {
      out.enum = [value]
    } else if (key !== 'enum') {
      out[key] = value
    }
  }
  return out
}
