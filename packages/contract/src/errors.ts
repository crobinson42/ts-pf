import type { AnySchema } from './schema.js'

export interface ErrorDef {
  status?: number
  message?: string
  data?: AnySchema
}

export type ErrorMap = Record<string, ErrorDef>
