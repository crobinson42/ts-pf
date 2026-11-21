import type { DocsMeta } from './docs.js'

export type JsonSchema = Record<string, unknown>

export type CatalogSchema =
  | { kind: 'json'; jsonSchema: JsonSchema; vendor?: string }
  | { kind: 'stream'; vendor: 'ts-pf'; item?: CatalogSchema }
  | { kind: 'unavailable'; reason: string; vendor?: string }

export type CatalogError = {
  code: string
  status?: number
  message?: string
  data?: CatalogSchema
}

/**
 * A procedure's `.expand()`: the input field listing what to expand, the key
 * path to the expandable object in the output, and each field's expanded
 * schema. The output schema is the wide one (every field in either form).
 */
export type CatalogExpand = {
  key: string
  at: string[]
  fields: Record<string, CatalogSchema>
}

export type CatalogProcedure = {
  path: string[]
  key: string
  href?: string
  docs?: DocsMeta
  meta: Record<string, unknown>
  input?: CatalogSchema
  output?: CatalogSchema
  expand?: CatalogExpand
  errors: CatalogError[]
}

export type ProcedureCatalog = {
  catalogVersion: 1
  protocol: {
    name: 'ts-pf'
    version: string
    header: { name: string; value: string }
    method: 'POST'
  }
  prefix?: string
  protocolErrors: ReadonlyArray<{
    code: string
    status: number
    data?: CatalogSchema
  }>
  procedures: CatalogProcedure[]
}
