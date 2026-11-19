import { canonicalize, type JsonSchema } from '@ts-pf/docs'
import {
  escapePointer,
  isRecord,
  normalizeType,
  resolvePointer,
} from './schema-util.js'

/**
 * `input`: the client sends it (a change must keep accepting what it accepted).
 * `output`: the client receives it — procedure output and error `data`
 * (a change must not hand an old client a value it cannot read).
 */
export type Direction = 'input' | 'output'

export type SchemaChangeKind =
  | 'type-changed'
  | 'nullable-added'
  | 'nullable-removed'
  | 'enum-added'
  | 'enum-removed'
  | 'enum-value-added'
  | 'enum-value-removed'
  | 'property-added'
  | 'required-property-added'
  | 'property-removed'
  | 'property-became-required'
  | 'property-became-optional'
  | 'additional-properties-closed'
  | 'additional-properties-opened'
  | 'bound-changed'
  | 'variant-added'
  | 'variant-removed'
  | 'unknown-change'

export type SchemaChange = {
  kind: SchemaChangeKind
  pointer: string
  message: string
  breaking: boolean
}

// Keywords the walker reasons about, and keywords it never reports
// (docs text, `format`, schema bookkeeping). Anything else that differs is a
// safe `unknown-change`.
const MODELED = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'enum',
  'const',
  'anyOf',
  'oneOf',
  'items',
])
/** Size / range keywords; `true` when a larger value allows more. */
const BOUNDS = new Map([
  ['minimum', false],
  ['exclusiveMinimum', false],
  ['minLength', false],
  ['minItems', false],
  ['minProperties', false],
  ['maximum', true],
  ['exclusiveMaximum', true],
  ['maxLength', true],
  ['maxItems', true],
  ['maxProperties', true],
])
const IGNORED = new Set([
  '$schema',
  '$id',
  '$defs',
  'definitions',
  '$comment',
  'title',
  'description',
  'examples',
  'default',
  'deprecated',
  'format',
  'readOnly',
  'writeOnly',
])

type Walk = {
  direction: Direction
  prevRoot: JsonSchema
  nextRoot: JsonSchema
  /** `$ref` pairs on the current path; stops recursive schemas. */
  refs: Set<string>
  report: (change: SchemaChange) => void
}

/**
 * Compares two JSON Schemas for one direction. Local `$ref`s resolve against
 * each side's own root (`$defs` / `definitions`).
 */
export function diffJsonSchema(
  prev: JsonSchema,
  next: JsonSchema,
  direction: Direction,
  pointer: string,
  report: (change: SchemaChange) => void,
): void {
  const walk: Walk = {
    direction,
    prevRoot: prev,
    nextRoot: next,
    refs: new Set(),
    report,
  }
  compareNode(prev, next, pointer, walk)
}

function compareNode(
  prevRaw: unknown,
  nextRaw: unknown,
  pointer: string,
  w: Walk,
): void {
  const refPair = `${refOf(prevRaw)}|${refOf(nextRaw)}`
  const tracked = refPair !== '|'
  if (tracked) {
    if (w.refs.has(refPair)) {
      return
    }
    w.refs.add(refPair)
  }
  const prev = split(resolve(prevRaw, w.prevRoot), w.prevRoot)
  const next = split(resolve(nextRaw, w.nextRoot), w.nextRoot)
  compareNullable(prev.nullable, next.nullable, pointer, w)
  if (prev.variants !== undefined || next.variants !== undefined) {
    compareVariants(prev, next, pointer, w)
  } else {
    compareTypes(prev.node, next.node, pointer, w)
    compareEnum(prev.node, next.node, pointer, w)
    compareObject(prev.node, next.node, pointer, w)
    compareItems(prev.node, next.node, pointer, w)
    compareBounds(prev.node, next.node, pointer, w)
    compareUnknown(prev.node, next.node, pointer, w)
  }
  if (tracked) {
    w.refs.delete(refPair)
  }
}

type Split = {
  node: JsonSchema
  nullable: boolean
  /** `anyOf` / `oneOf` members other than `{ type: 'null' }`, unresolved. */
  variants?: { keyword: string; items: unknown[] }
}

/** Pulls `null` out of a union or type array; unwraps a one-member union. */
function split(node: JsonSchema, root: JsonSchema): Split {
  const keyword = Array.isArray(node.anyOf)
    ? 'anyOf'
    : Array.isArray(node.oneOf)
      ? 'oneOf'
      : undefined
  const typeNull = normalizeType(node.type).includes('null')
  if (keyword === undefined) {
    return { node, nullable: typeNull }
  }
  const members = node[keyword] as unknown[]
  const items = members.filter((member) => !isNullSchema(member))
  const nullable = typeNull || items.length < members.length
  if (items.length === 1) {
    return { node: resolve(items[0], root), nullable }
  }
  return { node, nullable, variants: { keyword, items } }
}

function compareNullable(
  prev: boolean,
  next: boolean,
  pointer: string,
  w: Walk,
): void {
  if (prev === next) {
    return
  }
  w.report({
    kind: next ? 'nullable-added' : 'nullable-removed',
    pointer,
    message: next ? 'now accepts null' : 'no longer accepts null',
    breaking: w.direction === 'input' ? !next : next,
  })
}

function compareVariants(
  prev: Split,
  next: Split,
  pointer: string,
  w: Walk,
): void {
  const prevItems = prev.variants?.items ?? [prev.node]
  const nextItems = next.variants?.items ?? [next.node]
  const at = (side: Split, index: number) =>
    side.variants === undefined
      ? pointer
      : `${pointer}/${side.variants.keyword}/${String(index)}`
  const tag = discriminator(prevItems, nextItems, w)
  const tagOf = (item: unknown, root: JsonSchema) =>
    tag === undefined
      ? undefined
      : canonical(tagValue(resolve(item, root), tag, root))
  const keyOf = (item: unknown, root: JsonSchema) =>
    tagOf(item, root) ?? canonical(item)
  const label = (item: unknown, root: JsonSchema, index: number) => {
    const value = tagOf(item, root)
    return value === undefined
      ? `union variant ${String(index)}`
      : `union variant ${String(tag)}=${value}`
  }

  const unmatched = new Map(nextItems.map((item, index) => [index, item]))
  const removed: number[] = []
  prevItems.forEach((item, index) => {
    const key = keyOf(item, w.prevRoot)
    const match = [...unmatched].find(
      ([, candidate]) => keyOf(candidate, w.nextRoot) === key,
    )
    if (match === undefined) {
      removed.push(index)
      return
    }
    unmatched.delete(match[0])
    compareNode(item, match[1], at(next, match[0]), w)
  })
  // Untagged: one unmatched on each side is the same variant, edited.
  const [onlyAdded] = [...unmatched]
  const onlyRemoved = removed[0]
  if (
    tag === undefined &&
    removed.length === 1 &&
    unmatched.size === 1 &&
    onlyRemoved !== undefined &&
    onlyAdded !== undefined
  ) {
    compareNode(prevItems[onlyRemoved], onlyAdded[1], at(next, onlyAdded[0]), w)
    return
  }
  for (const index of removed) {
    w.report({
      kind: 'variant-removed',
      pointer: at(prev, index),
      message: `${label(prevItems[index], w.prevRoot, index)} removed`,
      breaking: w.direction === 'input',
    })
  }
  for (const [index, item] of unmatched) {
    w.report({
      kind: 'variant-added',
      pointer: at(next, index),
      message: `${label(item, w.nextRoot, index)} added`,
      breaking: false,
    })
  }
}

/** A property that is a `const` in every variant on both sides. */
function discriminator(
  prevItems: unknown[],
  nextItems: unknown[],
  w: Walk,
): string | undefined {
  const all = [
    ...prevItems.map((item) => ({ root: w.prevRoot, item })),
    ...nextItems.map((item) => ({ root: w.nextRoot, item })),
  ].map(({ root, item }) => ({ root, node: resolve(item, root) }))
  const first = all[0]?.node.properties
  if (!isRecord(first)) {
    return undefined
  }
  return Object.keys(first).find((name) =>
    all.every(({ root, node }) => tagValue(node, name, root) !== undefined),
  )
}

function tagValue(node: JsonSchema, name: string, root: JsonSchema): unknown {
  if (!isRecord(node.properties) || !(name in node.properties)) {
    return undefined
  }
  const values = enumValues(resolve(node.properties[name], root))
  return values?.length === 1 ? values[0] : undefined
}

function compareTypes(
  prev: JsonSchema,
  next: JsonSchema,
  pointer: string,
  w: Walk,
): void {
  const prevTypes = typeSet(prev)
  const nextTypes = typeSet(next)
  if (prevTypes === undefined && nextTypes === undefined) {
    return
  }
  let lost: boolean
  let gained: boolean
  if (prevTypes === undefined) {
    // An `enum` / `const` without `type` is compared by compareEnum.
    if (enumValues(prev) !== undefined) {
      return
    }
    lost = true
    gained = false
  } else if (nextTypes === undefined) {
    if (enumValues(next) !== undefined) {
      return
    }
    lost = false
    gained = true
  } else {
    lost = [...prevTypes].some((type) => !covers(nextTypes, type))
    gained = [...nextTypes].some((type) => !covers(prevTypes, type))
  }
  if (!lost && !gained) {
    return
  }
  w.report({
    kind: 'type-changed',
    pointer,
    message: `type ${formatTypes(prevTypes)} -> ${formatTypes(nextTypes)}`,
    breaking: w.direction === 'input' ? lost : gained,
  })
}

function compareEnum(
  prev: JsonSchema,
  next: JsonSchema,
  pointer: string,
  w: Walk,
): void {
  const prevValues = enumValues(prev)
  const nextValues = enumValues(next)
  if (prevValues === undefined && nextValues === undefined) {
    return
  }
  if (prevValues === undefined || nextValues === undefined) {
    const added = prevValues === undefined
    w.report({
      kind: added ? 'enum-added' : 'enum-removed',
      pointer,
      message: added
        ? `values restricted to ${(nextValues ?? []).map(canonical).join(', ')}`
        : 'values no longer restricted',
      breaking: w.direction === 'input' ? added : !added,
    })
    return
  }
  const prevKeys = new Set(prevValues.map(canonical))
  const nextKeys = new Set(nextValues.map(canonical))
  for (const value of prevKeys) {
    if (!nextKeys.has(value)) {
      w.report({
        kind: 'enum-value-removed',
        pointer,
        message: `value ${value} removed`,
        breaking: w.direction === 'input',
      })
    }
  }
  for (const value of nextKeys) {
    if (!prevKeys.has(value)) {
      w.report({
        kind: 'enum-value-added',
        pointer,
        message: `value ${value} added`,
        breaking: false,
      })
    }
  }
}

function compareObject(
  prev: JsonSchema,
  next: JsonSchema,
  pointer: string,
  w: Walk,
): void {
  const prevProps = isRecord(prev.properties) ? prev.properties : {}
  const nextProps = isRecord(next.properties) ? next.properties : {}
  const prevRequired = requiredSet(prev)
  const nextRequired = requiredSet(next)
  const input = w.direction === 'input'
  const nextClosed = next.additionalProperties === false
  const names = new Set([...Object.keys(prevProps), ...Object.keys(nextProps)])
  for (const name of names) {
    const at = `${pointer}/properties/${escapePointer(name)}`
    const quoted = JSON.stringify(name)
    if (!(name in nextProps)) {
      const wasRequired = prevRequired.has(name)
      w.report({
        kind: 'property-removed',
        pointer: at,
        message: `${wasRequired ? 'required' : 'optional'} property ${quoted} removed`,
        // Input: clients still send it; only a closed object rejects it.
        // Output: old clients read a required property.
        breaking: input ? nextClosed : wasRequired,
      })
      continue
    }
    if (!(name in prevProps)) {
      const required = nextRequired.has(name)
      w.report({
        kind: input && required ? 'required-property-added' : 'property-added',
        pointer: at,
        message: `${required ? 'required' : 'optional'} property ${quoted} added`,
        breaking: input && required,
      })
      continue
    }
    if (prevRequired.has(name) !== nextRequired.has(name)) {
      const nowRequired = nextRequired.has(name)
      w.report({
        kind: nowRequired
          ? 'property-became-required'
          : 'property-became-optional',
        pointer: at,
        message: `property ${quoted} became ${nowRequired ? 'required' : 'optional'}`,
        breaking: input ? nowRequired : !nowRequired,
      })
    }
    compareNode(prevProps[name], nextProps[name], at, w)
  }
  compareAdditional(
    prev.additionalProperties,
    next.additionalProperties,
    pointer,
    w,
  )
}

function compareAdditional(
  prev: unknown,
  next: unknown,
  pointer: string,
  w: Walk,
): void {
  const at = `${pointer}/additionalProperties`
  if (prev !== false && next === false) {
    w.report({
      kind: 'additional-properties-closed',
      pointer: at,
      message: 'unknown properties are now rejected',
      breaking: w.direction === 'input',
    })
  } else if (prev === false && next !== false) {
    w.report({
      kind: 'additional-properties-opened',
      pointer: at,
      message: 'unknown properties are now allowed',
      breaking: false,
    })
  } else if (isRecord(prev) && isRecord(next)) {
    compareNode(prev, next, at, w)
  }
}

function compareItems(
  prev: JsonSchema,
  next: JsonSchema,
  pointer: string,
  w: Walk,
): void {
  if (prev.items === undefined && next.items === undefined) {
    return
  }
  compareNode(prev.items ?? {}, next.items ?? {}, `${pointer}/items`, w)
}

function compareBounds(
  prev: JsonSchema,
  next: JsonSchema,
  pointer: string,
  w: Walk,
): void {
  for (const [key, upper] of BOUNDS) {
    const before = bound(prev[key], upper)
    const after = bound(next[key], upper)
    if (before === after) {
      continue
    }
    const narrower =
      before === undefined ||
      (after !== undefined && (upper ? after < before : after > before))
    w.report({
      kind: 'bound-changed',
      pointer: `${pointer}/${key}`,
      message: `${key} ${String(before ?? 'none')} -> ${String(after ?? 'none')}`,
      breaking: w.direction === 'input' ? narrower : !narrower,
    })
  }
}

/**
 * A numeric bound, or `undefined` when absent. The safe-integer range that
 * zod's `.int()` emits is treated as no bound.
 */
function bound(value: unknown, upper: boolean): number | undefined {
  if (typeof value !== 'number') {
    return undefined
  }
  const unbounded = upper
    ? value >= Number.MAX_SAFE_INTEGER
    : value <= Number.MIN_SAFE_INTEGER
  return unbounded ? undefined : value
}

function compareUnknown(
  prev: JsonSchema,
  next: JsonSchema,
  pointer: string,
  w: Walk,
): void {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  for (const key of keys) {
    if (MODELED.has(key) || BOUNDS.has(key) || IGNORED.has(key)) {
      continue
    }
    if (canonical(prev[key]) !== canonical(next[key])) {
      w.report({
        kind: 'unknown-change',
        pointer: `${pointer}/${escapePointer(key)}`,
        message: `${JSON.stringify(key)} changed (not checked)`,
        breaking: false,
      })
    }
  }
}

function resolve(raw: unknown, root: JsonSchema): JsonSchema {
  let node = asSchema(raw)
  for (let depth = 0; depth < 32 && typeof node.$ref === 'string'; depth++) {
    const target = resolvePointer(root, node.$ref)
    if (target === undefined) {
      return node
    }
    const { $ref: _ref, ...siblings } = node
    node = { ...asSchema(target), ...siblings }
  }
  return node
}

function refOf(raw: unknown): string {
  return isRecord(raw) && typeof raw.$ref === 'string' ? raw.$ref : ''
}

function asSchema(raw: unknown): JsonSchema {
  if (raw === false) {
    return { not: {} }
  }
  return isRecord(raw) ? raw : {}
}

function isNullSchema(raw: unknown): boolean {
  if (!isRecord(raw)) {
    return false
  }
  const types = normalizeType(raw.type)
  return types.length === 1 && types[0] === 'null'
}

/** Declared types without `null` (nullability is compared separately). */
function typeSet(node: JsonSchema): Set<string> | undefined {
  if (node.type === undefined) {
    return isRecord(node.properties) ? new Set(['object']) : undefined
  }
  return new Set(normalizeType(node.type).filter((type) => type !== 'null'))
}

function covers(types: Set<string>, type: string): boolean {
  return types.has(type) || (type === 'integer' && types.has('number'))
}

function formatTypes(types: Set<string> | undefined): string {
  return types === undefined ? 'any' : [...types].join(' | ') || 'null'
}

function enumValues(node: JsonSchema): unknown[] | undefined {
  if ('const' in node) {
    return [node.const]
  }
  return Array.isArray(node.enum) ? node.enum : undefined
}

function requiredSet(node: JsonSchema): Set<string> {
  return new Set(
    Array.isArray(node.required)
      ? node.required.filter((name): name is string => typeof name === 'string')
      : [],
  )
}

function canonical(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? 'undefined'
}
