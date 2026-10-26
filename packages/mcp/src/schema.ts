import { type JsonSchema, toJsonSchema } from '@ts-pf/docs'
import type { ToolSpec } from './tool.js'

export type SchemaIssue = { level: 'error' | 'warn'; message: string }
/** A model-facing JSON Schema plus what `audit()` should report about it. */
export type ModelSchema = { schema: JsonSchema; issues: SchemaIssue[] }

const emptyObject = (): JsonSchema => ({ type: 'object', properties: {} })
const cache = new WeakMap<object, ModelSchema>()

function isObject(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const combinators = ['anyOf', 'oneOf', 'allOf'] as const

/** Union / `allOf` members: each one can contribute top-level keys. */
function membersOf(schema: JsonSchema): JsonSchema[] {
  return combinators.flatMap((which) => {
    const members = schema[which]
    return Array.isArray(members) ? members.filter(isObject) : []
  })
}

/**
 * Inline local `$ref`s (`#/$defs/X`, `#/definitions/X`) so clients that do not
 * resolve references still see the full shape. A recursive reference stays a
 * `$ref` (its definitions are kept) and is reported.
 */
function inlineRefs(root: JsonSchema): ModelSchema {
  const defs = {
    ...(isObject(root.definitions) ? root.definitions : {}),
    ...(isObject(root.$defs) ? root.$defs : {}),
  } as Record<string, unknown>
  let recursive = false
  const visit = (node: unknown, stack: readonly string[]): unknown => {
    if (Array.isArray(node)) return node.map((item) => visit(item, stack))
    if (!isObject(node)) return node
    const ref = node.$ref
    if (typeof ref === 'string') {
      const name = /^#\/(?:\$defs|definitions)\/(.+)$/.exec(ref)?.[1]
      if (ref === '#' || (name !== undefined && stack.includes(name))) {
        recursive = true
        return node
      }
      if (name !== undefined && Object.hasOwn(defs, name)) {
        const { $ref: _ref, ...rest } = node
        const resolved = visit(defs[name], [...stack, name]) as JsonSchema
        return Object.keys(rest).length > 0
          ? { ...resolved, ...(visit(rest, stack) as JsonSchema) }
          : resolved
      }
    }
    const out: JsonSchema = {}
    for (const [key, value] of Object.entries(node)) {
      if (key === '$schema' || key === '$defs' || key === 'definitions')
        continue
      out[key] = visit(value, stack)
    }
    return out
  }
  const schema = visit(root, []) as JsonSchema
  if (!recursive) return { schema, issues: [] }
  return {
    schema: { ...schema, $defs: root.$defs ?? root.definitions },
    issues: [
      {
        level: 'warn',
        message: 'schema is recursive; references stay as $ref',
      },
    ],
  }
}

/** JSON Schema of a contract / tool schema, inlined; memoized per schema object. */
function convert(schema: unknown, io: 'input' | 'output'): ModelSchema {
  const key = schema as object
  const hit = io === 'input' ? cache.get(key) : undefined
  if (hit) return hit
  let result: ModelSchema
  try {
    result = inlineRefs(toJsonSchema(schema, { io }))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    result = {
      schema: emptyObject(),
      issues: [{ level: 'error', message: `no JSON Schema: ${reason}` }],
    }
  }
  if (io === 'input') cache.set(key, result)
  return result
}

/** Top-level keys of an input; `open` when it also takes any other key (a record or catchall). */
export type InputKeys = { keys: string[]; open: boolean }

/**
 * Object properties plus those of every union / `allOf` member. `undefined`
 * when a member is a `$ref` left by recursion: its keys cannot be read.
 */
function inputKeys(schema: JsonSchema): InputKeys | undefined {
  if (typeof schema.$ref === 'string') return undefined
  const keys = new Set(
    isObject(schema.properties) ? Object.keys(schema.properties) : [],
  )
  let open =
    isObject(schema.additionalProperties) ||
    schema.additionalProperties === true ||
    isObject(schema.patternProperties)
  for (const member of membersOf(schema)) {
    const inner = inputKeys(member)
    if (!inner) return undefined
    for (const key of inner.keys) keys.add(key)
    open ||= inner.open
  }
  return { keys: [...keys], open }
}

/** Removes `keys` from the properties and `required` of the root and every union / `allOf` member. */
function withoutKeys(schema: JsonSchema, keys: readonly string[]): JsonSchema {
  const out: JsonSchema = { ...schema }
  for (const which of combinators) {
    const members = schema[which]
    if (Array.isArray(members)) {
      out[which] = members.map((m: unknown) =>
        isObject(m) ? withoutKeys(m, keys) : m,
      )
    }
  }
  if (isObject(schema.properties)) {
    const properties = { ...schema.properties } as Record<string, unknown>
    for (const key of keys) delete properties[key]
    out.properties = properties
  }
  if (Array.isArray(schema.required)) {
    out.required = schema.required.filter(
      (key: unknown) => !keys.includes(key as string),
    )
  }
  return out
}

/** MCP tool arguments are always an object, so the advertised root is `type: 'object'`. */
function objectRoot(schema: JsonSchema, issues: SchemaIssue[]): JsonSchema {
  if (schema.type === 'object') return schema
  if (membersOf(schema).length > 0) {
    issues.push({
      level: 'warn',
      message:
        'input root is a union / allOf; some clients only read top-level properties. Consider .input(schema, map)',
    })
    return { type: 'object', ...schema }
  }
  issues.push({
    level: 'error',
    message: `input root is not an object (${JSON.stringify(schema.type ?? 'any')}); the model cannot call it. Use .input(schema, map)`,
  })
  return emptyObject()
}

/** The JSON Schema of what the model sends: `.input()` schema, or the procedure input minus injected keys. */
export function modelInputSchema(spec: ToolSpec): ModelSchema {
  const source = spec.input?.schema ?? spec.procedure?.['~pf'].input
  if (source === undefined) return { schema: emptyObject(), issues: [] }
  const base = convert(source, 'input')
  const issues = [...base.issues]
  const injected = Object.keys(spec.inject)
  const schema =
    injected.length > 0 ? withoutKeys(base.schema, injected) : base.schema
  return { schema: objectRoot(schema, issues), issues }
}

/**
 * Input keys of a procedure, for `all({ inject })` (each key goes only to
 * tools that have it). `undefined` when the input has no readable JSON Schema.
 */
export function procedureInputKeys(spec: ToolSpec): InputKeys | undefined {
  const source = spec.procedure?.['~pf'].input
  if (source === undefined) return { keys: [], open: false }
  const { schema, issues } = convert(source, 'input')
  // the only error `convert` reports is a failed conversion
  return issues.some((i) => i.level === 'error') ? undefined : inputKeys(schema)
}

/** The advertised `outputSchema`: only for `.output(schema, map)` with an object root. */
export function modelOutputSchema(spec: ToolSpec): {
  schema?: JsonSchema
  issues: SchemaIssue[]
} {
  const source = spec.output?.schema
  if (source === undefined) return { issues: [] }
  const { schema, issues } = convert(source, 'output')
  if (schema.type !== 'object') {
    return {
      issues: [
        ...issues,
        {
          level: 'warn',
          message:
            'output schema root is not an object; outputSchema is not advertised',
        },
      ],
    }
  }
  return { schema, issues }
}
