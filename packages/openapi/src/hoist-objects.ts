import { canonicalize, type JsonSchema } from '@ts-pf/docs'
import { resolveComponent } from './document.js'
import { idSchemaName, pascalCase } from './names.js'
import { componentRef, rewriteRefs } from './refs.js'
import { unionTag } from './tags.js'
import type { OpenAPIDocument, OpenAPIOptions } from './types.js'
import { isSchemaObject } from './walk.js'

type Naming = NonNullable<OpenAPIOptions['naming']>

// A hoisted object's `$ref` until every shape has its name.
const PENDING = '#pending/'

/** One distinct hoisted shape and every structural name it was found at. */
type Shape = { body: JsonSchema; names: string[] }

/**
 * `hoist: 'objects'`: every inline object (a schema with `properties`)
 * nested in a component that holds a catalog schema becomes a component of
 * its own. Protocol envelopes are not in `dataComponents`, so they keep
 * their inline objects. Names are structural (see `childName`); identical
 * shapes share one component, named by the alphabetically first of their
 * names, so the result does not depend on traversal order. Throws when one
 * name is chosen for two different shapes or is already a component.
 * Warns once, listing the names it made up.
 */
export function hoistObjects(
  document: OpenAPIDocument,
  dataComponents: ReadonlySet<string>,
  naming: Naming,
): void {
  const { schemas } = document.components
  const shapes: Shape[] = []
  const byShape = new Map<string, number>()

  const hoist = (child: unknown, name: string): unknown => {
    if (!isSchemaObject(child)) {
      return child
    }
    const body = nested(child, name, false)
    if (!isInlineObject(child)) {
      return body
    }
    const key = JSON.stringify(canonicalize(body))
    let index = byShape.get(key)
    if (index === undefined) {
      index = shapes.length
      shapes.push({ body, names: [] })
      byShape.set(key, index)
    }
    shapes[index]?.names.push(name)
    return { $ref: `${PENDING}${index}` }
  }

  /** Copies `schema` with its nested inline objects hoisted. */
  const nested = (schema: JsonSchema, name: string, root: boolean) => {
    const out: JsonSchema = { ...schema }
    const { properties, items, additionalProperties, allOf } = schema
    if (isSchemaObject(properties)) {
      out.properties = Object.fromEntries(
        Object.entries(properties).map(([key, child]) => [
          key,
          hoist(child, childName(name, key, naming)),
        ]),
      )
    }
    if (isSchemaObject(items)) {
      out.items = hoist(items, childName(name, 'Item', naming))
    }
    if (isSchemaObject(additionalProperties)) {
      out.additionalProperties = hoist(
        additionalProperties,
        childName(name, 'Value', naming),
      )
    }
    for (const key of ['oneOf', 'anyOf'] as const) {
      const variants = schema[key]
      if (Array.isArray(variants)) {
        const segments = variantSegments(variants, schemas, naming, root)
        out[key] = variants.map((variant, index) =>
          hoist(variant, childName(name, segments[index] ?? '', naming)),
        )
      }
    }
    // An `allOf` member is part of its parent's object, not a model.
    if (Array.isArray(allOf)) {
      out.allOf = allOf.map((member) =>
        isSchemaObject(member) ? nested(member, name, root) : member,
      )
    }
    return out
  }

  const roots = new Map<string, JsonSchema>()
  for (const [name, schema] of Object.entries(schemas)) {
    if (dataComponents.has(name)) {
      roots.set(name, nested(schema, name, true))
    }
  }

  const chosen = shapes.map((shape) => [...shape.names].sort()[0] ?? '')
  const owners = new Map<string, number>()
  chosen.forEach((name, index) => {
    if (Object.hasOwn(schemas, name) || owners.has(name)) {
      throw new Error(
        `openapi(): hoist 'objects' names two different schemas "${name}". Give the nested object a distinct .meta({ id }).`,
      )
    }
    owners.set(name, index)
  })

  const resolve = (schema: JsonSchema) =>
    rewriteRefs(schema, (ref) =>
      ref.startsWith(PENDING)
        ? (componentRef(chosen[Number(ref.slice(PENDING.length))] ?? '')
            .$ref as string)
        : ref,
    )
  for (const [name, root] of roots) {
    schemas[name] = resolve(root)
  }
  shapes.forEach((shape, index) => {
    schemas[chosen[index] ?? ''] = resolve(shape.body)
  })
  if (chosen.length > 0) {
    console.warn(
      `openapi(): hoist 'objects' named ${chosen.length} inline object(s): ${[...chosen].sort().join(', ')}. Give each a .meta({ id }) for a name you choose.`,
    )
  }
}

/**
 * `BookFind` + `author` → `BookFindAuthor` (`naming: 'pascal'`) or
 * `BookFind.author` (`naming: 'path'`). An empty segment keeps the name.
 */
function childName(parent: string, segment: string, naming: Naming): string {
  if (segment === '') {
    return parent
  }
  return naming === 'pascal'
    ? `${parent}${pascalCase(segment) || '_'}`
    : `${parent}.${idSchemaName(segment)}`
}

/**
 * The name segment of each union variant: its tag value when the union is
 * tagged (`unionTag`, refs followed), else `Option1`, `Option2`, … counting
 * inline objects. A nested union with one inline object (`.nullable()`)
 * names it like the union; at a component root that name is taken, so it
 * is `Option1`.
 */
function variantSegments(
  variants: readonly unknown[],
  schemas: Record<string, JsonSchema>,
  naming: Naming,
  root: boolean,
): string[] {
  const resolved = variants.map((variant) =>
    isSchemaObject(variant) ? resolveComponent(schemas, variant) : undefined,
  )
  const tag = resolved.every((variant) => variant !== undefined)
    ? unionTag(resolved)
    : undefined
  if (tag !== undefined) {
    const names = tag.values.map((value) => childName('', value, naming))
    if (new Set(names).size === names.length) {
      return tag.values
    }
  }
  const objects = variants.filter(isInlineObject).length
  if (objects === 1 && !root) {
    return variants.map(() => '')
  }
  let count = 0
  return variants.map((variant) =>
    isInlineObject(variant) ? `Option${++count}` : '',
  )
}

function isInlineObject(value: unknown): value is JsonSchema {
  return (
    isSchemaObject(value) &&
    value.$ref === undefined &&
    isSchemaObject(value.properties) &&
    Object.keys(value.properties).length > 0
  )
}
