import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { SchemaAdapter, ValidationIssue } from '../schema-types.js'

function isStandardSchema(schema: unknown): schema is StandardSchemaV1 {
  return typeof schema === 'object' && schema !== null && '~standard' in schema
}

function toIssues(issues: ReadonlyArray<StandardSchemaV1.Issue>): ValidationIssue[] {
  return issues.map((issue) => ({
    message: issue.message,
    path: (issue.path ?? []).map((segment) => {
      if (typeof segment === 'object' && segment !== null && 'key' in segment) {
        const key = (segment as { key: PropertyKey }).key
        return typeof key === 'number' ? key : String(key)
      }
      return typeof segment === 'number' ? segment : String(segment)
    }),
  }))
}

export const standardSchemaAdapter: SchemaAdapter = {
  vendor: 'standard-schema',
  accept: isStandardSchema,
  async validate(schema, value) {
    const result = await (schema as StandardSchemaV1)['~standard'].validate(value)
    if (result.issues) {
      return { success: false, issues: toIssues(result.issues) }
    }
    return { success: true, value: result.value }
  },
}
