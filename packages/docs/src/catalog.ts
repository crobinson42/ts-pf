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
  /**
   * Throw when a procedure in the catalog (after `filter`; the default
   * filter drops `hidden`) has no non-blank `docs()` `description` or
   * `summary`. The error lists every such procedure key. Default false.
   */
  requireDescription?: boolean
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
            items: { oneOf: [{ type: 'string' }, { type: 'number' }] },
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
  if (options.requireDescription) {
    assertDescribed(procedures)
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

function assertDescribed(procedures: readonly CatalogProcedure[]): void {
  const missing = procedures
    .filter((proc) => !hasText(proc.docs?.description, proc.docs?.summary))
    .map((proc) => proc.key)
  if (missing.length > 0) {
    throw new Error(
      `catalog(): ${missing.length} procedure(s) have no docs() description or summary: ${missing.join(', ')}`,
    )
  }
}

function hasText(...values: unknown[]): boolean {
  return values.some(
    (value) => typeof value === 'string' && value.trim() !== '',
  )
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
      expand?: {
        key: string
        at: readonly string[]
        fields: Record<string, unknown>
      }
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
    if (def.expand !== undefined) {
      proc.expand = {
        key: def.expand.key,
        at: [...def.expand.at],
        fields: Object.fromEntries(
          Object.entries(def.expand.fields).map(([name, schema]) => [
            name,
            toCatalogSchema(schema, 'output'),
          ]),
        ),
      }
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
