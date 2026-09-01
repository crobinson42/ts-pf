export type ValidationIssue = { message: string; path: Array<string | number> }

export type SchemaResult<T> =
  | { success: true; value: T }
  | { success: false; issues: ValidationIssue[] }

export interface SchemaAdapter {
  vendor: string
  accept(schema: unknown): boolean
  validate(schema: unknown, value: unknown): Promise<SchemaResult<unknown>>
}
