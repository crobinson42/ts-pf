import {
  joinProcedurePath,
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
  ProtocolErrorCode,
} from '@ts-pf/protocol'
import { getDocs } from './docs.js'
import type {
  CatalogError,
  CatalogProcedure,
  ProcedureCatalog,
} from './types.js'
import { walkContract } from './walk.js'

export type CatalogOptions = {
  prefix?: string
  schemas?: boolean
  filter?: (entry: {
    path: string[]
    procedure: { readonly '~pf': { meta: Record<string, unknown> } }
  }) => boolean
}

const PROTOCOL_ERRORS: ReadonlyArray<{ code: string; status: number }> = [
  { code: ProtocolErrorCode.BAD_REQUEST, status: 400 },
  { code: ProtocolErrorCode.VALIDATION, status: 422 },
  { code: ProtocolErrorCode.NOT_FOUND, status: 404 },
  { code: ProtocolErrorCode.INTERNAL, status: 500 },
  { code: ProtocolErrorCode.METHOD_NOT_ALLOWED, status: 405 },
  { code: ProtocolErrorCode.PAYLOAD_TOO_LARGE, status: 413 },
]

export function catalog(
  contract: unknown,
  options: CatalogOptions = {},
): ProcedureCatalog {
  const schemas = options.schemas ?? true
  const filter =
    options.filter ??
    ((entry) => getDocs(entry.procedure['~pf'].meta)?.hidden !== true)

  const procedures: CatalogProcedure[] = []
  for (const entry of walkContract(contract)) {
    if (!filter(entry)) {
      continue
    }
    procedures.push(
      toProcedure(entry.path, entry.procedure, options.prefix, schemas),
    )
  }

  const result: ProcedureCatalog = {
    catalogVersion: 1,
    protocol: {
      name: 'ts-pf',
      version: PROTOCOL_VERSION,
      header: { name: PROTOCOL_HEADER, value: PROTOCOL_VERSION },
      method: 'POST',
    },
    protocolErrors: PROTOCOL_ERRORS,
    procedures,
  }
  if (options.prefix !== undefined) {
    result.prefix = options.prefix
  }
  return result
}

function toProcedure(
  path: string[],
  procedure: {
    readonly '~pf': {
      meta: Record<string, unknown>
      errors: Record<
        string,
        { status?: number; message?: string; data?: unknown }
      >
      input?: unknown
      output?: unknown
    }
  },
  prefix: string | undefined,
  schemas: boolean,
): CatalogProcedure {
  const def = procedure['~pf']
  const docs = getDocs(def.meta)
  const proc: CatalogProcedure = {
    path,
    key: path.join('/'),
    meta: { ...def.meta },
    errors: Object.entries(def.errors).map(([code, err]) => {
      const item: CatalogError = { code }
      if (err.status !== undefined) {
        item.status = err.status
      }
      if (err.message !== undefined) {
        item.message = err.message
      }
      return item
    }),
  }
  if (prefix !== undefined) {
    proc.href = joinProcedurePath(prefix, path)
  }
  if (docs !== undefined) {
    proc.docs = docs
  }
  void schemas
  return proc
}
