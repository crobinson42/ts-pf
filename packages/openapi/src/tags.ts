import type { JsonSchema } from '@ts-pf/docs'
import { isSchemaObject } from './walk.js'

/** A union's tag property and each variant's value for it, in order. */
export type UnionTag = { property: string; values: string[] }

/**
 * The tag of a union of two or more objects: a property every variant
 * requires and pins to a string (`const: v`, or `enum: [v]` after
 * `constAsEnum`), with a different value in each. When several properties
 * qualify, the first in alphabetical order wins.
 */
export function unionTag(
  variants: readonly JsonSchema[],
): UnionTag | undefined {
  const first = variants[0]
  if (variants.length < 2 || !isSchemaObject(first?.properties)) {
    return undefined
  }
  for (const property of Object.keys(first.properties).sort()) {
    const values = variants.map((variant) => tagValue(variant, property))
    if (
      values.every((value) => value !== undefined) &&
      new Set(values).size === values.length
    ) {
      return { property, values }
    }
  }
  return undefined
}

function tagValue(variant: JsonSchema, property: string): string | undefined {
  const { properties, required } = variant
  if (
    !isSchemaObject(properties) ||
    !Array.isArray(required) ||
    !required.includes(property)
  ) {
    return undefined
  }
  const schema = properties[property]
  if (!isSchemaObject(schema)) {
    return undefined
  }
  const value = Object.hasOwn(schema, 'const')
    ? schema.const
    : Array.isArray(schema.enum) && schema.enum.length === 1
      ? schema.enum[0]
      : undefined
  return typeof value === 'string' ? value : undefined
}
