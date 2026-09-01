import type { AnySchema, InferSchemaOutput } from './schema.js'

export interface ErrorDef {
  status?: number
  message?: string
  data?: AnySchema
}

export type ErrorMap = Record<string, ErrorDef>

export type InferErrorData<D extends ErrorDef> = D extends { data: infer S }
  ? S extends AnySchema
    ? InferSchemaOutput<S>
    : never
  : never
