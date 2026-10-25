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

function branchesOf(schema: JsonSchema): JsonSchema[] | undefined {
  const branches = schema.anyOf ?? schema.oneOf
  return Array.isArray(branches) ? branches.filter(isObject) : undefined
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

/** Top-level keys a model may send: object properties, or the union of a union root's branches. */
export function inputKeys(schema: JsonSchema): string[] {
  const branches = branchesOf(schema)
  if (branches) return [...new Set(branches.flatMap(inputKeys))]
  return isObject(schema.properties) ? Object.keys(schema.properties) : []
}

function withoutKeys(
  schema: JsonSchema,
  keys: readonly string[],
  issues: SchemaIssue[],
): JsonSchema {
  const branches = branchesOf(schema)
  if (branches) {
    const which = schema.anyOf ? 'anyOf' : 'oneOf'
    return {
      ...schema,
      [which]: branches.map((b) => withoutKeys(b, keys, issues)),
    }
  }
  if (!isObject(schema.properties)) {
    if (Array.isArray(schema.allOf)) {
      issues.push({
        level: 'error',
        message: `allOf root: injected ${keys.join(', ')} cannot be removed; use .input(schema, map)`,
      })
    }
    return schema
  }
  const properties = { ...schema.properties } as Record<string, unknown>
  for (const key of keys) delete properties[key]
  const out: JsonSchema = { ...schema, properties }
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
  if (branchesOf(schema) || Array.isArray(schema.allOf)) {
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
    injected.length > 0
      ? withoutKeys(base.schema, injected, issues)
      : base.schema
  return { schema: objectRoot(schema, issues), issues }
}

/** Input keys of a procedure, for `all({ inject })` (each key goes only to tools that have it). */
export function procedureInputKeys(spec: ToolSpec): string[] {
  const source = spec.procedure?.['~pf'].input
  return source === undefined ? [] : inputKeys(convert(source, 'input').schema)
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
