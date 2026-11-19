import type { JsonSchema } from '@ts-pf/docs'
import { idSchemaName } from './names.js'
import { normalizeSchema, type Side } from './normalize.js'
import { componentRef, defTarget, relocateRef, rewriteRefs } from './refs.js'

// Zod names unnamed recursive schemas `__schema0`, `__schema1`, … in each
// conversion, so the same key means different schemas in different
// procedures. These stay per host (`<host>.__schema0`); every other def key
// is a user `.meta({ id })` and becomes one shared component.
const GENERATED_DEF = /^__schema\d+$/

/** One catalog schema placed under a component (`planet.find.Input`, …). */
type Slot = {
  host: string
  side: Side
  root: JsonSchema
  defs: Record<string, JsonSchema>
  generated: Map<string, string>
}

/** The first schema seen for an id on one side, plus who uses it. */
type IdEntry = {
  shape: string
  body: JsonSchema
  slot: Slot
  owners: string[]
  refs: Set<string>
}

export type Hoister = {
  /**
   * Registers `schema` as component `host` (its key is reserved in
   * `schemas` now, so document order follows registration order) and
   * returns a `$ref` to it.
   */
  add(host: string, side: Side, owner: string, schema: JsonSchema): JsonSchema
  /**
   * Writes every host, id, and generated component into `schemas` and
   * returns their names: the components that hold catalog schemas, as
   * opposed to protocol envelopes.
   */
  finish(): Set<string>
}

/**
 * Normalizes catalog schemas and lifts root `$defs` / `definitions` into
 * `components.schemas`:
 *
 * - one component per id when every use has the same shape;
 * - output shape keeps `<id>`, input shape becomes `<id>Input` when they
 *   differ (or when the input shape points at an id that split);
 * - two shapes for one id on the same side throw.
 */
export function createHoister(schemas: Record<string, JsonSchema>): Hoister {
  const slots: Slot[] = []
  const ids = new Map<string, Partial<Record<Side, IdEntry>>>()
  const generatedByShape = new Map<string, string>()
  const written = new Set<string>()

  function add(
    host: string,
    side: Side,
    owner: string,
    schema: JsonSchema,
  ): JsonSchema {
    const slot = prepare(host, side, schema)
    claim(host, {}) // placeholder until finish() rewrites the root
    slots.push(slot)
    for (const [id, body] of Object.entries(slot.defs)) {
      if (!GENERATED_DEF.test(id)) {
        registerId(id, body, slot, owner)
      }
    }
    return componentRef(host)
  }

  function registerId(
    id: string,
    body: JsonSchema,
    slot: Slot,
    owner: string,
  ): void {
    const refs = new Set<string>()
    const shape = shapeOf(body, slot, [], refs)
    const sides = ids.get(id) ?? {}
    const existing = sides[slot.side]
    if (existing === undefined) {
      sides[slot.side] = { shape, body, slot, owners: [owner], refs }
      ids.set(id, sides)
      return
    }
    if (existing.shape !== shape) {
      throw new Error(
        `openapi(): schema id "${id}" has two different ${slot.side} shapes (${[...existing.owners, owner].join(', ')}). Give one of them a distinct .meta({ id }).`,
      )
    }
    if (!existing.owners.includes(owner)) {
      existing.owners.push(owner)
    }
  }

  function claim(name: string, schema: JsonSchema): void {
    if (Object.hasOwn(schemas, name)) {
      throw new Error(
        `openapi(): component "${name}" would be written twice. A .meta({ id }) or procedure path collides with another component name; rename one.`,
      )
    }
    schemas[name] = schema
    written.add(name)
  }

  function finish(): Set<string> {
    const split = splitIds(ids)

    const idName = (id: string, side: Side) =>
      side === 'input' && split.has(id)
        ? `${idSchemaName(id)}Input`
        : idSchemaName(id)

    const generatedName = (key: string, slot: Slot): string => {
      const cached = slot.generated.get(key)
      if (cached !== undefined) {
        return cached
      }
      // Identical generated defs (same side and shape) share one component.
      const body = slot.defs[key] ?? {}
      const shape = `${slot.side}:${shapeOf(body, slot, [key], new Set())}`
      const shared = generatedByShape.get(shape)
      const name = shared ?? `${slot.host}.${idSchemaName(key)}`
      slot.generated.set(key, name)
      if (shared === undefined) {
        generatedByShape.set(shape, name)
        claim(name, rewrite(body, slot))
      }
      return name
    }

    const rewrite = (schema: JsonSchema, slot: Slot): JsonSchema =>
      rewriteRefs(schema, (ref) => {
        const target = defTarget(ref)
        if (target === undefined || !Object.hasOwn(slot.defs, target.key)) {
          return relocateRef(ref, slot.host)
        }
        const name = GENERATED_DEF.test(target.key)
          ? generatedName(target.key, slot)
          : idName(target.key, slot.side)
        return `${componentRef(name).$ref}${target.rest}`
      })

    for (const slot of slots) {
      schemas[slot.host] = rewrite(slot.root, slot)
    }
    for (const [id, sides] of ids) {
      const { input, output } = sides
      if (output !== undefined) {
        claim(idName(id, 'output'), rewrite(output.body, output.slot))
      }
      if (input !== undefined && (output === undefined || split.has(id))) {
        claim(idName(id, 'input'), rewrite(input.body, input.slot))
      }
    }
    return written
  }

  return { add, finish }
}

/**
 * A comparable key for a schema's shape after normalization (ids by name,
 * generated defs inlined). `undefined` (no schema) has its own key.
 */
export function shapeKey(schema: JsonSchema | undefined, side: Side): string {
  if (schema === undefined) {
    return ''
  }
  const slot = prepare('', side, schema)
  return shapeOf(slot.root, slot, [], new Set())
}

function prepare(host: string, side: Side, schema: JsonSchema): Slot {
  const { $defs, definitions, ...root } = normalizeSchema(schema, side)
  return {
    host,
    side,
    root,
    defs: { ...asRecord(definitions), ...asRecord($defs) },
    generated: new Map(),
  }
}

/**
 * Serializes `schema` with refs made position-independent: ids by name,
 * generated defs inlined (cycles as a depth marker), and other local refs
 * tied to the slot's host. Collects the ids it reaches into `refs`.
 */
function shapeOf(
  schema: JsonSchema,
  slot: Slot,
  stack: readonly string[],
  refs: Set<string>,
): string {
  const canonical = rewriteRefs(schema, (ref) => {
    const target = defTarget(ref)
    if (target === undefined || !Object.hasOwn(slot.defs, target.key)) {
      return `${slot.host}${ref}`
    }
    if (!GENERATED_DEF.test(target.key)) {
      refs.add(target.key)
      return `id:${target.key}${target.rest}`
    }
    const depth = stack.indexOf(target.key)
    if (depth >= 0) {
      return `cycle:${stack.length - depth}${target.rest}`
    }
    const body = slot.defs[target.key] ?? {}
    return `${shapeOf(body, slot, [...stack, target.key], refs)}${target.rest}`
  })
  return JSON.stringify(canonical)
}

/**
 * Ids whose input shape differs from their output shape, closed over
 * references: an id whose input shape points at a split id splits too.
 */
function splitIds(
  ids: Map<string, Partial<Record<Side, IdEntry>>>,
): Set<string> {
  const split = new Set<string>()
  for (const [id, { input, output }] of ids) {
    if (input !== undefined && output !== undefined) {
      if (input.shape !== output.shape) {
        split.add(id)
      }
    }
  }
  let grew = split.size > 0
  while (grew) {
    grew = false
    for (const [id, { input, output }] of ids) {
      if (split.has(id) || input === undefined || output === undefined) {
        continue
      }
      if ([...input.refs].some((ref) => split.has(ref))) {
        split.add(id)
        grew = true
      }
    }
  }
  for (const id of split) {
    if (ids.has(`${id}Input`)) {
      throw new Error(
        `openapi(): schema id "${id}" differs between input and output, and its input name "${id}Input" is already an id. Rename one with .meta({ id }).`,
      )
    }
  }
  return split
}

function asRecord(value: unknown): Record<string, JsonSchema> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, JsonSchema>)
    : {}
}
