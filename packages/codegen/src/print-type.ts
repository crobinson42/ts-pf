import { pascalCase, quoteKey, quoteString } from './names.js'

export type PrintResult = {
  ts: string
  aliases: Array<{ name: string; ts: string }>
}

const IGNORED_KEYS = new Set([
  '$schema',
  '$id',
  '$comment',
  '$anchor',
  '$dynamicAnchor',
  'title',
  'description',
  'default',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'unevaluatedProperties',
  'dependentSchemas',
  'dependentRequired',
])

export function printJsonSchema(
  schema: unknown,
  ctx: { prefix: string },
): PrintResult {
  const printer = new Printer(ctx.prefix)
  const ts = printer.printRoot(schema)
  return { ts, aliases: printer.listAliases() }
}

class Printer {
  private readonly aliasMap = new Map<string, string>()
  private readonly printing = new Set<string>()
  private readonly defAlias = new Map<string, string>()
  private root: unknown

  constructor(private readonly prefix: string) {}

  listAliases(): Array<{ name: string; ts: string }> {
    return [...this.aliasMap].map(([name, ts]) => ({ name, ts }))
  }

  printRoot(schema: unknown): string {
    this.root = schema
    this.collectDefs(schema)
    if (containsRef(schema, '#')) {
      return this.ensureAlias(this.prefix, schema, '#')
    }
    return this.print(schema, '#')
  }

  private collectDefs(schema: unknown): void {
    if (!isRecord(schema)) {
      return
    }
    const defsKey = isRecord(schema.$defs)
      ? '$defs'
      : isRecord(schema.definitions)
        ? 'definitions'
        : undefined
    if (defsKey === undefined) {
      return
    }
    const defs = schema[defsKey] as Record<string, unknown>
    for (const key of Object.keys(defs).sort()) {
      const pointer = `#/${defsKey}/${escapePointer(key)}`
      const alias = `${this.prefix}_${pascalCase(key)}`
      this.defAlias.set(pointer, alias)
    }
    for (const key of Object.keys(defs).sort()) {
      const pointer = `#/${defsKey}/${escapePointer(key)}`
      const alias = this.defAlias.get(pointer)
      const target = defs[key]
      if (alias === undefined || target === undefined) {
        continue
      }
      this.ensureAlias(alias, target, pointer)
    }
  }

  private ensureAlias(name: string, schema: unknown, pointer: string): string {
    if (this.aliasMap.has(name) || this.printing.has(name)) {
      return name
    }
    this.printing.add(name)
    const ts = this.print(schema, pointer)
    this.aliasMap.set(name, ts)
    this.printing.delete(name)
    return name
  }

  private print(schema: unknown, pointer: string): string {
    if (schema === true) {
      return 'unknown'
    }
    if (schema === false) {
      return 'never'
    }
    if (!isRecord(schema)) {
      return 'unknown'
    }
    if (isEmptySchema(schema)) {
      return 'unknown'
    }

    if (typeof schema.$ref === 'string') {
      return this.printRef(schema.$ref)
    }
    if (typeof schema.$dynamicRef === 'string') {
      return 'unknown /* unsupported: $dynamicRef */'
    }

    if (isEmptySchema(schema.not)) {
      return 'never'
    }

    if ('const' in schema) {
      return printConst(schema.const)
    }
    if (Array.isArray(schema.enum)) {
      if (schema.enum.length === 0) {
        return 'never'
      }
      return unique(schema.enum.map(printConst)).join(' | ')
    }

    if (Array.isArray(schema.anyOf)) {
      return this.joinUnion(schema.anyOf, `${pointer}/anyOf`)
    }
    if (Array.isArray(schema.oneOf)) {
      return this.joinUnion(schema.oneOf, `${pointer}/oneOf`)
    }
    if (Array.isArray(schema.allOf)) {
      return this.joinIntersection(schema.allOf, `${pointer}/allOf`)
    }

    const types = normalizeType(schema.type)
    if (types.length > 1) {
      return unique(
        types.map((type) => this.printNamedType(schema, type, pointer)),
      ).join(' | ')
    }
    if (types.length === 1) {
      const only = types[0]
      if (only === undefined) {
        return 'unknown'
      }
      return this.printNamedType(schema, only, pointer)
    }

    if (isRecord(schema.properties) || 'additionalProperties' in schema) {
      return this.printObject(schema, pointer)
    }
    if ('prefixItems' in schema || 'items' in schema) {
      return this.printArray(schema, pointer)
    }

    if (
      schema.if !== undefined ||
      schema.then !== undefined ||
      schema.else !== undefined
    ) {
      return 'unknown /* unsupported: if */'
    }
    if (schema.not !== undefined) {
      return 'unknown /* unsupported: not */'
    }

    return 'unknown'
  }

  private printRef(ref: string): string {
    if (!ref.startsWith('#')) {
      return 'unknown /* external $ref */'
    }

    const known = this.defAlias.get(ref)
    if (known !== undefined) {
      const target = resolvePointer(this.root, ref)
      if (target === undefined) {
        return 'unknown'
      }
      return this.ensureAlias(known, target, ref)
    }

    if (ref === '#') {
      return this.ensureAlias(this.prefix, this.root, '#')
    }

    const target = resolvePointer(this.root, ref)
    if (target === undefined) {
      return 'unknown /* unresolvable $ref */'
    }

    const alias = `${this.prefix}_${pointerAlias(ref)}`
    if (this.printing.has(alias) || this.aliasMap.has(alias)) {
      return alias
    }
    return this.print(target, ref)
  }

  private printNamedType(
    schema: Record<string, unknown>,
    type: string,
    pointer: string,
  ): string {
    switch (type) {
      case 'string':
        return 'string'
      case 'number':
      case 'integer':
        return 'number'
      case 'boolean':
        return 'boolean'
      case 'null':
        return 'null'
      case 'object':
        return this.printObject(schema, pointer)
      case 'array':
        return this.printArray(schema, pointer)
      default:
        return 'unknown'
    }
  }

  private printObject(
    schema: Record<string, unknown>,
    pointer: string,
  ): string {
    const properties = isRecord(schema.properties) ? schema.properties : {}
    const required = new Set(
      Array.isArray(schema.required)
        ? schema.required.filter(
            (key): key is string => typeof key === 'string',
          )
        : [],
    )
    const fields: Array<{ key: string; optional: boolean; ts: string }> = []
    for (const key of Object.keys(properties)) {
      const value = properties[key]
      fields.push({
        key: quoteKey(key),
        optional: !required.has(key),
        ts: this.print(value, `${pointer}/properties/${escapePointer(key)}`),
      })
    }

    let index: string | undefined
    if (schema.additionalProperties === false) {
      index = undefined
    } else if (schema.additionalProperties === true) {
      index = 'unknown'
    } else if (schema.additionalProperties === undefined) {
      // Zod input / TypeBox omit additionalProperties. Listed properties are
      // the TS shape (live `z.object({ id: z.number() })` is `{ id: number }`).
      // A free-form object with no properties is a dictionary.
      index = fields.length === 0 ? 'unknown' : undefined
    } else {
      index = this.print(
        schema.additionalProperties,
        `${pointer}/additionalProperties`,
      )
    }

    return formatObject(fields, index)
  }

  private printArray(schema: Record<string, unknown>, pointer: string): string {
    if (Array.isArray(schema.prefixItems)) {
      const head = schema.prefixItems.map((item, i) =>
        this.print(item, `${pointer}/prefixItems/${String(i)}`),
      )
      if (schema.items === false || schema.items === undefined) {
        return `[${head.join(', ')}]`
      }
      const rest = parenUnion(this.print(schema.items, `${pointer}/items`))
      return `[${head.join(', ')}, ...${rest}[]]`
    }

    if (Array.isArray(schema.items)) {
      const head = schema.items.map((item, i) =>
        this.print(item, `${pointer}/items/${String(i)}`),
      )
      return `[${head.join(', ')}]`
    }

    if (schema.items === false) {
      return '[]'
    }
    if (schema.items !== undefined) {
      return `${parenUnion(this.print(schema.items, `${pointer}/items`))}[]`
    }
    return 'unknown[]'
  }

  private joinUnion(items: unknown[], pointer: string): string {
    if (items.length === 0) {
      return 'never'
    }
    return unique(
      items.map((item, i) => this.print(item, `${pointer}/${String(i)}`)),
    ).join(' | ')
  }

  private joinIntersection(items: unknown[], pointer: string): string {
    if (items.length === 0) {
      return 'unknown'
    }
    return unique(
      items.map((item, i) =>
        parenUnion(this.print(item, `${pointer}/${String(i)}`)),
      ),
    ).join(' & ')
  }
}

function formatObject(
  fields: Array<{ key: string; optional: boolean; ts: string }>,
  index: string | undefined,
): string {
  const members = fields.map(
    (field) => `${field.key}${field.optional ? '?' : ''}: ${field.ts}`,
  )
  if (index !== undefined) {
    members.push(`[key: string]: ${index}`)
  }
  if (members.length === 0) {
    return '{}'
  }
  const compact =
    members.every((member) => !member.includes('\n')) &&
    members.join('; ').length < 80
  if (compact) {
    return `{ ${members.join('; ')} }`
  }
  return `{\n  ${members.map((member) => member.replace(/\n/g, '\n  ')).join('\n  ')}\n}`
}

function printConst(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return quoteString(value)
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'number'
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (Array.isArray(value)) {
    return `[${value.map(printConst).join(', ')}]`
  }
  if (isRecord(value)) {
    const fields = Object.keys(value).map((key) => ({
      key: quoteKey(key),
      optional: false,
      ts: printConst(value[key]),
    }))
    return formatObject(fields, undefined)
  }
  return 'unknown'
}

function normalizeType(type: unknown): string[] {
  if (typeof type === 'string') {
    return [type]
  }
  if (Array.isArray(type)) {
    return type.filter((item): item is string => typeof item === 'string')
  }
  return []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIgnoredKey(key: string): boolean {
  return IGNORED_KEYS.has(key) || key.startsWith('~') || key.startsWith('x-')
}

function isEmptySchema(value: unknown): boolean {
  if (value === true) {
    return true
  }
  if (!isRecord(value)) {
    return false
  }
  return Object.keys(value).every(isIgnoredKey)
}

function containsRef(
  schema: unknown,
  target: string,
  seen = new Set<unknown>(),
): boolean {
  if (!isRecord(schema) && !Array.isArray(schema)) {
    return false
  }
  if (seen.has(schema)) {
    return false
  }
  seen.add(schema)
  if (isRecord(schema) && schema.$ref === target) {
    return true
  }
  const values = Array.isArray(schema) ? schema : Object.values(schema)
  return values.some((value) => containsRef(value, target, seen))
}

function resolvePointer(root: unknown, ref: string): unknown {
  if (ref === '#') {
    return root
  }
  if (!ref.startsWith('#/')) {
    return undefined
  }
  let current: unknown = root
  for (const part of ref.slice(2).split('/').map(unescapePointer)) {
    if (!isRecord(current) && !Array.isArray(current)) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function escapePointer(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

function unescapePointer(value: string): string {
  return value.replace(/~1/g, '/').replace(/~0/g, '~')
}

function pointerAlias(ref: string): string {
  const raw = ref.replace(/^#\/?/, '')
  if (raw.length === 0) {
    return ''
  }
  return raw
    .split('/')
    .map((part) => pascalCase(unescapePointer(part)))
    .join('_')
}

function parenUnion(ts: string): string {
  return ts.includes('|') || ts.includes('&') ? `(${ts})` : ts
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
