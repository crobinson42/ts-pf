import type { JsonSchema } from '@ts-pf/docs'
import {
  componentTarget,
  mapDocumentSchemas,
  resolveComponent,
} from './document.js'
import { unionTag } from './tags.js'
import type { OpenAPIDocument } from './types.js'
import { isSchemaObject, mapSchema } from './walk.js'

/**
 * `discriminators`: add `discriminator: { propertyName, mapping }` to every
 * `oneOf` / `anyOf` whose variants are all whole-component `$ref`s with a
 * tag (see `unionTag`). Each mapping value is the variant's `$ref`. A union
 * that does not qualify (an inline variant, no common tag) is left as is.
 */
export function discriminators(document: OpenAPIDocument): void {
  const { schemas } = document.components
  mapDocumentSchemas(
    document,
    (schema) =>
      mapSchema(schema, (node) =>
        withDiscriminator(node, schemas),
      ) as JsonSchema,
  )
}

function withDiscriminator(
  node: JsonSchema,
  schemas: Record<string, JsonSchema>,
): JsonSchema {
  if (Object.hasOwn(node, 'discriminator')) {
    return node
  }
  for (const key of ['oneOf', 'anyOf'] as const) {
    const refs = componentRefs(node[key])
    const variants = refs?.map((ref) =>
      resolveComponent(schemas, { $ref: ref }),
    )
    if (refs === undefined || variants === undefined) {
      continue
    }
    if (!variants.every((variant) => variant !== undefined)) {
      continue
    }
    const tag = unionTag(variants)
    if (tag === undefined) {
      continue
    }
    const mapping = Object.fromEntries(
      tag.values.map((value, index) => [value, refs[index]]),
    )
    return {
      ...node,
      discriminator: { propertyName: tag.property, mapping },
    }
  }
  return node
}

/** The `$ref` strings of a list made only of whole-component `$ref`s. */
function componentRefs(variants: unknown): string[] | undefined {
  if (!Array.isArray(variants)) {
    return undefined
  }
  const refs: string[] = []
  for (const variant of variants) {
    if (!isSchemaObject(variant) || Object.keys(variant).length !== 1) {
      return undefined
    }
    const target = componentTarget(variant.$ref)
    if (target === undefined || target.rest !== '') {
      return undefined
    }
    refs.push(variant.$ref as string)
  }
  return refs
}
