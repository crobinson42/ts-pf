import type { JsonSchema } from '@ts-pf/docs'
import { componentTarget, mapDocumentSchemas } from './document.js'
import type { Side } from './normalize.js'
import type { OpenAPIDocument } from './types.js'
import { forEachSchema, isSchemaObject, mapSchema } from './walk.js'

/**
 * `closeInputs`: add `additionalProperties: false` to object schemas that
 * only requests reach. A component that a response also reaches stays open,
 * and so does an object that is a member of an `allOf` (closing it would
 * reject the other members' properties).
 */
export function closeInputs(document: OpenAPIDocument): void {
  const { schemas } = document.components
  const reach = reachedComponents(document)
  for (const [name, schema] of Object.entries(schemas)) {
    if (
      reach.input.has(name) &&
      !reach.output.has(name) &&
      !reach.allOfMembers.has(name)
    ) {
      schemas[name] = closeObjects(schema)
    }
  }
  mapDocumentSchemas(document, (schema, side) =>
    side === 'input' ? closeObjects(schema) : schema,
  )
}

type Reach = Record<Side, Set<string>> & { allOfMembers: Set<string> }

/** Component names each side reaches, following `$ref`s transitively. */
function reachedComponents(document: OpenAPIDocument): Reach {
  const { schemas } = document.components
  const reach: Reach = {
    input: new Set(),
    output: new Set(),
    allOfMembers: new Set(),
  }
  const visit = (schema: JsonSchema, side: Side) => {
    forEachSchema(schema, (node) => {
      for (const member of Array.isArray(node.allOf) ? node.allOf : []) {
        const target = isSchemaObject(member)
          ? componentTarget(member.$ref)
          : undefined
        if (target !== undefined) {
          reach.allOfMembers.add(target.name)
        }
      }
      const target = componentTarget(node.$ref)
      if (target === undefined || reach[side].has(target.name)) {
        return
      }
      reach[side].add(target.name)
      const component = schemas[target.name]
      if (component !== undefined) {
        visit(component, side)
      }
    })
  }
  mapDocumentSchemas(document, (schema, side) => {
    if (side !== undefined) {
      visit(schema, side)
    }
    return schema
  })
  // A component no operation refers to (`<Code>Data` under shared errors)
  // documents a response, so it counts as output.
  for (const [name, schema] of Object.entries(schemas)) {
    if (!reach.input.has(name) && !reach.output.has(name)) {
      reach.output.add(name)
      visit(schema, 'output')
    }
  }
  return reach
}

/** Closes every open object in `schema`, except direct `allOf` members. */
function closeObjects(schema: JsonSchema): JsonSchema {
  const closed = new WeakSet<JsonSchema>()
  return mapSchema(schema, (node) => {
    const out = Array.isArray(node.allOf)
      ? { ...node, allOf: node.allOf.map((member) => reopen(member, closed)) }
      : node
    if (!isOpenObject(out)) {
      return out
    }
    const next = { ...out, additionalProperties: false }
    closed.add(next)
    return next
  }) as JsonSchema
}

function reopen(member: unknown, closed: WeakSet<JsonSchema>): unknown {
  if (!isSchemaObject(member) || !closed.has(member)) {
    return member
  }
  const { additionalProperties: _closed, ...open } = member
  return open
}

// A node that combines subschemas gets properties from them, which its own
// `additionalProperties` would not see.
const COMBINATORS = ['allOf', 'anyOf', 'oneOf'] as const

function isOpenObject(node: JsonSchema): boolean {
  if (
    Object.hasOwn(node, 'additionalProperties') ||
    Object.hasOwn(node, 'unevaluatedProperties') ||
    COMBINATORS.some((key) => Object.hasOwn(node, key))
  ) {
    return false
  }
  const { type } = node
  return (
    type === 'object' ||
    (Array.isArray(type) && type.includes('object')) ||
    (type === undefined && isSchemaObject(node.properties))
  )
}
