import type { DocsMeta } from './docs.js'

export type JsonSchema = Record<string, unknown>

export type CatalogSchema =
  | { kind: 'json'; jsonSchema: JsonSchema; vendor?: string }
  | { kind: 'stream'; vendor: 'ts-pf' }
  | { kind: 'unavailable'; reason: string; vendor?: string }

export type CatalogError = {
  code: string
  status?: number
  message?: string
  data?: CatalogSchema
}

export type CatalogProcedure = {
  path: string[]
  key: string
  href?: string
  docs?: DocsMeta
  meta: Record<string, unknown>
  input?: CatalogSchema
  output?: CatalogSchema
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
  protocolErrors: ReadonlyArray<{ code: string; status: number }>
  procedures: CatalogProcedure[]
}
