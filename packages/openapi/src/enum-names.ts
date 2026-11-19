import type { JsonSchema } from '@ts-pf/docs'
import { mapDocumentSchemas } from './document.js'
import { idSchemaName } from './names.js'
import { componentRef } from './refs.js'
import type { OpenAPIDocument, OpenAPIOptions } from './types.js'
import { forEachSchema, mapSchema } from './walk.js'

export type EnumNames = NonNullable<OpenAPIOptions['enumNames']>

/**
 * `enumNames`: every inline `enum` whose value set (order-insensitive)
 * equals an entry's becomes a `$ref` to a component with the entry's name
 * and values (in the entry's order). The node's other keywords (a
 * `description`, a `default`) stay next to the `$ref`. Component roots are
 * already named and are left alone; an existing component with the entry's
 * name is reused when it is the same enum. Throws on an invalid or empty
 * entry, two entries with one value set, or a name taken by another schema.
 * Warns once about entries that matched nothing.
 */
export function enumNames(document: OpenAPIDocument, names: EnumNames): void {
  const byValues = nameByValues(names)
  if (byValues.size === 0) {
    return
  }
  const isMatch = (node: JsonSchema) =>
    Array.isArray(node.enum) && byValues.has(valueSetKey(node.enum))
  const nameOf = (node: JsonSchema) =>
    byValues.get(valueSetKey(node.enum as unknown[])) ?? ''

  // First pass: the `type` each name's matches agree on, if any.
  const types = new Map<string, unknown[]>()
  forEachInline(document, (node) => {
    if (isMatch(node)) {
      const name = nameOf(node)
      types.set(name, [...(types.get(name) ?? []), node.type])
    }
  })

  const { schemas } = document.components
  for (const [name, seen] of types) {
    const body = enumBody(seen, names[name] ?? [])
    const existing = schemas[name]
    if (existing === undefined) {
      schemas[name] = body
    } else if (!sameEnum(existing, body)) {
      throw new Error(
        `openapi(): enumNames "${name}" is already a component with a different schema. Rename the entry.`,
      )
    }
  }

  mapDocumentSchemas(
    document,
    (root, side) =>
      mapSchema(root, (node, source) => {
        if ((side === undefined && source === root) || !isMatch(node)) {
          return node
        }
        const name = nameOf(node)
        const { enum: _values, ...rest } = node
        if (schemas[name]?.type !== undefined) {
          delete rest.type
        }
        return { ...componentRef(name), ...rest }
      }) as JsonSchema,
  )

  const unused = Object.keys(names).filter((name) => !types.has(name))
  if (unused.length > 0) {
    console.warn(
      `openapi(): enumNames entries matched no inline enum: ${unused.join(', ')}.`,
    )
  }
}

/** Value-set key → entry name, after validating every entry. */
function nameByValues(names: EnumNames): Map<string, string> {
  const byValues = new Map<string, string>()
  for (const [name, values] of Object.entries(names)) {
    if (idSchemaName(name) !== name) {
      throw new Error(
        `openapi(): enumNames "${name}" is not a valid component name (use [A-Za-z0-9._-]).`,
      )
    }
    if (values.length === 0) {
      throw new Error(`openapi(): enumNames "${name}" has no values.`)
    }
    const key = valueSetKey(values)
    const other = byValues.get(key)
    if (other !== undefined) {
      throw new Error(
        `openapi(): enumNames "${other}" and "${name}" have the same values. Keep one.`,
      )
    }
    byValues.set(key, name)
  }
  return byValues
}

/** Calls `visit` with every schema below the component and parameter roots. */
function forEachInline(
  document: OpenAPIDocument,
  visit: (node: JsonSchema) => void,
): void {
  mapDocumentSchemas(document, (root, side) => {
    forEachSchema(root, (node) => {
      if (side !== undefined || node !== root) {
        visit(node)
      }
    })
    return root
  })
}

function enumBody(
  types: readonly unknown[],
  values: EnumNames[string],
): JsonSchema {
  const type = types[0]
  const agreed =
    type !== undefined &&
    types.every((other) => JSON.stringify(other) === JSON.stringify(type))
  return agreed ? { type, enum: [...values] } : { enum: [...values] }
}

function sameEnum(existing: JsonSchema, body: JsonSchema): boolean {
  const keys = Object.keys(existing).sort().join()
  return (
    Array.isArray(existing.enum) &&
    keys === Object.keys(body).sort().join() &&
    valueSetKey(existing.enum) === valueSetKey(body.enum as unknown[]) &&
    JSON.stringify(existing.type) === JSON.stringify(body.type)
  )
}

function valueSetKey(values: readonly unknown[]): string {
  return JSON.stringify(
    [...new Set(values.map((value) => JSON.stringify(value)))].sort(),
  )
}
