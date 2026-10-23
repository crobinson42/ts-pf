import {
  joinProcedurePath,
  PROTOCOL_HEADER,
  PROTOCOL_HTTP_STATUS,
} from '@ts-pf/http'
import { PROTOCOL_VERSION, ProtocolErrorCode } from '@ts-pf/protocol'
import { getDocs } from './docs.js'
import { tryToJsonSchema } from './json-schema.js'
import type {
  CatalogError,
  CatalogProcedure,
  CatalogSchema,
  JsonSchema,
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

// Must match packages/protocol/PROTOCOL.md (VALIDATION data.issues).
const VALIDATION_DATA_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['issues'],
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['message', 'path'],
        properties: {
          message: { type: 'string' },
          path: {
            type: 'array',
            items: { type: ['string', 'number'] },
          },
        },
      },
    },
  },
}

// Codes come from ProtocolErrorCode (key order); statuses from the
// @ts-pf/http table. Neither is hand-copied here.
const PROTOCOL_ERRORS: ReadonlyArray<{
  code: string
  status: number
  data?: CatalogSchema
}> = Object.values(ProtocolErrorCode).map((code) =>
  code === ProtocolErrorCode.VALIDATION
    ? {
        code,
        status: PROTOCOL_HTTP_STATUS[code],
        data: { kind: 'json', jsonSchema: VALIDATION_DATA_SCHEMA },
      }
    : { code, status: PROTOCOL_HTTP_STATUS[code] },
)

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
      if (schemas && err.data !== undefined) {
        item.data = toCatalogSchema(err.data, 'output')
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
  if (schemas) {
    if (def.input !== undefined) {
      proc.input = toCatalogSchema(def.input, 'input')
    }
    if (def.output !== undefined) {
      proc.output = toCatalogSchema(def.output, 'output')
    }
  }
  return proc
}

function isTsPfStream(schema: unknown): boolean {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    '~standard' in schema &&
    (schema as { '~standard'?: { vendor?: string } })['~standard']?.vendor ===
      'ts-pf'
  )
}

function streamItem(schema: unknown): unknown | undefined {
  if (
    typeof schema !== 'object' ||
    schema === null ||
    !('~pfStream' in schema)
  ) {
    return undefined
  }
  const brand = (schema as { '~pfStream'?: { item?: unknown } })['~pfStream']
  if (typeof brand !== 'object' || brand === null || !('item' in brand)) {
    return undefined
  }
  return brand.item
}

function toCatalogSchema(
  schema: unknown,
  io: 'input' | 'output',
): CatalogSchema {
  if (isTsPfStream(schema)) {
    const result: CatalogSchema = { kind: 'stream', vendor: 'ts-pf' }
    const item = streamItem(schema)
    if (item !== undefined) {
      result.item = toCatalogSchema(item, io)
    }
    return result
  }
  const converted = tryToJsonSchema(schema, { io })
  if (converted.ok) {
    const result: CatalogSchema = {
      kind: 'json',
      jsonSchema: converted.schema,
    }
    if (converted.vendor !== undefined) {
      result.vendor = converted.vendor
    }
    return result
  }
  return { kind: 'unavailable', reason: converted.reason }
}
