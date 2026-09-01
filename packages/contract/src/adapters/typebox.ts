import type { SchemaAdapter, ValidationIssue } from '../schema-types.js'

function isTypeBoxSchema(schema: unknown): boolean {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    '~kind' in schema &&
    typeof (schema as { '~kind': unknown })['~kind'] === 'string'
  )
}

function pathFromInstancePath(instancePath: string): Array<string | number> {
  return instancePath
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => {
      const asNumber = Number(part)
      return Number.isInteger(asNumber) && String(asNumber) === part
        ? asNumber
        : part
    })
}

export const typeboxAdapter: SchemaAdapter = {
  vendor: 'typebox',
  accept: isTypeBoxSchema,
  async validate(schema, value) {
    const Value = (await import('typebox/value')).default
    if (Value.Check(schema as never, value)) {
      return { success: true, value }
    }
    const issues: ValidationIssue[] = []
    for (const error of Value.Errors(schema as never, value)) {
      issues.push({
        message: error.message,
        path: pathFromInstancePath(error.instancePath),
      })
    }
    return { success: false, issues }
  },
}
