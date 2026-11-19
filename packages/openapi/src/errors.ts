import type {
  CatalogError,
  CatalogProcedure,
  JsonSchema,
  ProcedureCatalog,
} from '@ts-pf/docs'
import { failureEnvelope, innerFromCatalog } from './envelope.js'
import { type Hoister, shapeKey } from './hoist.js'
import {
  operationId,
  protocolErrorSchemaName,
  schemaName,
  sharedErrorSchemaName,
} from './names.js'
import { componentRef, putSchema } from './refs.js'

const SKIP_PROTOCOL = new Set(['METHOD_NOT_ALLOWED', 'NOT_FOUND'])

type StatusEntry = {
  code: string
  description: string
  schema: JsonSchema
}

export function protocolErrorRefs(
  catalog: ProcedureCatalog,
  schemas: Record<string, JsonSchema>,
  hoister: Hoister,
): Map<string, JsonSchema> {
  const refs = new Map<string, JsonSchema>()
  for (const err of catalog.protocolErrors) {
    const name = protocolErrorSchemaName(err.code)
    const data =
      err.data !== undefined
        ? hoister.add(
            `${name}.Data`,
            'output',
            'protocol errors',
            innerFromCatalog(err.data) ?? {},
          )
        : undefined
    refs.set(
      err.code,
      putSchema(schemas, name, failureEnvelope(err.code, data)),
    )
  }
  return refs
}

/**
 * One `Error.<code>` component (and `Error.<code>.Data`) for each declared
 * code whose data shape is the same on every procedure that declares it.
 * Codes whose data differs stay per procedure (see `operationErrorResponses`).
 */
export function sharedErrorRefs(
  catalog: ProcedureCatalog,
  schemas: Record<string, JsonSchema>,
  hoister: Hoister,
): Map<string, JsonSchema> {
  const byCode = new Map<
    string,
    {
      shape: string
      data: JsonSchema | undefined
      owners: string[]
      shared: boolean
    }
  >()
  for (const proc of catalog.procedures) {
    for (const err of proc.errors) {
      const data = errorData(err)
      const shape = shapeKey(data, 'output')
      const owner = operationId(proc.path)
      const entry = byCode.get(err.code)
      if (entry === undefined) {
        byCode.set(err.code, { shape, data, owners: [owner], shared: true })
        continue
      }
      entry.owners.push(owner)
      entry.shared &&= entry.shape === shape
    }
  }

  const refs = new Map<string, JsonSchema>()
  for (const [code, entry] of byCode) {
    if (!entry.shared) {
      continue
    }
    const name = sharedErrorSchemaName(code)
    const data =
      entry.data !== undefined
        ? hoister.add(
            `${name}.Data`,
            'output',
            entry.owners.join(', '),
            entry.data,
          )
        : undefined
    refs.set(code, putSchema(schemas, name, failureEnvelope(code, data)))
  }
  return refs
}

export function errorData(err: CatalogError): JsonSchema | undefined {
  return err.data !== undefined ? (innerFromCatalog(err.data) ?? {}) : undefined
}

/** An error an operation can return. */
export type OperationError = {
  code: string
  status: number
  description: string
  /** Set for a code the procedure declares; unset for a protocol code. */
  declared?: CatalogError
}

/**
 * The errors `proc` can return: its declared codes, then the protocol codes
 * a matched POST can produce (not 404 / 405; `VALIDATION` only with input).
 */
export function operationErrors(
  proc: CatalogProcedure,
  catalog: ProcedureCatalog,
  includeProtocolErrors: boolean,
): OperationError[] {
  const list: OperationError[] = []
  const add = (entry: OperationError) => {
    if (!list.some((e) => e.status === entry.status && e.code === entry.code)) {
      list.push(entry)
    }
  }
  for (const err of proc.errors) {
    add({
      code: err.code,
      status: err.status ?? 400,
      description: err.message ?? err.code,
      declared: err,
    })
  }
  if (includeProtocolErrors) {
    for (const err of catalog.protocolErrors) {
      if (SKIP_PROTOCOL.has(err.code)) {
        continue
      }
      if (err.code === 'VALIDATION' && proc.input === undefined) {
        continue
      }
      add({ code: err.code, status: err.status, description: err.code })
    }
  }
  return list
}

export function operationErrorResponses(
  proc: CatalogProcedure,
  options: {
    includeProtocolErrors: boolean
    catalog: ProcedureCatalog
    schemas: Record<string, JsonSchema>
    hoister: Hoister
    protocolRefs: Map<string, JsonSchema>
    sharedErrorRefs: Map<string, JsonSchema>
  },
): Record<string, ErrorResponse> {
  const errors = operationErrors(
    proc,
    options.catalog,
    options.includeProtocolErrors,
  )
  return errorResponses(errors, (error) =>
    error.declared !== undefined
      ? (options.sharedErrorRefs.get(error.code) ??
        procedureErrorRef(proc, error.declared, options))
      : (options.protocolRefs.get(error.code) ??
        componentRef(protocolErrorSchemaName(error.code))),
  )
}

type ErrorResponse = {
  description: string
  content: { 'application/json': { schema: JsonSchema } }
}

/**
 * One response per status. `schemaOf` runs once per error, in list order;
 * a status with several distinct schemas gets a `oneOf`.
 */
export function errorResponses(
  errors: readonly OperationError[],
  schemaOf: (error: OperationError) => JsonSchema,
): Record<string, ErrorResponse> {
  const groups = new Map<number, StatusEntry[]>()
  for (const error of errors) {
    const list = groups.get(error.status) ?? []
    list.push({
      code: error.code,
      description: error.description,
      schema: schemaOf(error),
    })
    groups.set(error.status, list)
  }

  const responses: Record<string, ErrorResponse> = {}
  const statuses = [...groups.keys()].sort((a, b) => a - b)
  for (const status of statuses) {
    const entries = groups.get(status) ?? []
    const first = entries[0]
    if (first === undefined) {
      continue
    }
    const schemas = distinct(entries.map((entry) => entry.schema))
    responses[String(status)] = {
      description:
        entries.length === 1
          ? first.description
          : entries.map((entry) => entry.code).join(', '),
      content: {
        'application/json': {
          schema: schemas.length === 1 ? first.schema : { oneOf: schemas },
        },
      },
    }
  }
  return responses
}

function distinct(schemas: JsonSchema[]): JsonSchema[] {
  const seen = new Set<string>()
  return schemas.filter((schema) => {
    const key = JSON.stringify(schema)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function procedureErrorRef(
  proc: CatalogProcedure,
  err: CatalogError,
  options: { schemas: Record<string, JsonSchema>; hoister: Hoister },
): JsonSchema {
  const name = schemaName(proc.path, `Error.${err.code}`)
  const data = errorData(err)
  const dataRef =
    data !== undefined
      ? options.hoister.add(
          `${name}.Data`,
          'output',
          operationId(proc.path),
          data,
        )
      : undefined
  return putSchema(options.schemas, name, failureEnvelope(err.code, dataRef))
}
