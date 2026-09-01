import type { SchemaAdapter, ValidationIssue } from '../schema-types.js'

const TYPEBOX_KIND = Symbol.for('TypeBox.Kind')

function isTypeBoxSchema(schema: unknown): boolean {
  return typeof schema === 'object' && schema !== null && TYPEBOX_KIND in schema
}

export const typeboxAdapter: SchemaAdapter = {
  vendor: 'typebox',
  accept: isTypeBoxSchema,
  async validate(schema, value) {
    const { Value } = await import('@sinclair/typebox/value')
    if (Value.Check(schema as never, value)) {
      return { success: true, value }
    }
    const issues: ValidationIssue[] = []
    for (const error of Value.Errors(schema as never, value)) {
      issues.push({
        message: error.message,
        path: error.path
          .split('/')
          .filter((part) => part.length > 0)
          .map((part) => {
            const asNumber = Number(part)
            return Number.isInteger(asNumber) && String(asNumber) === part
              ? asNumber
              : part
          }),
      })
    }
    return { success: false, issues }
  },
}
