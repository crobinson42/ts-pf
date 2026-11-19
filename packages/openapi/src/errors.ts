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
import { putSchema } from './refs.js'

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

function errorData(err: CatalogError): JsonSchema | undefined {
  return err.data !== undefined ? (innerFromCatalog(err.data) ?? {}) : undefined
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
): Record<
  string,
  {
    description: string
    content: { 'application/json': { schema: JsonSchema } }
  }
> {
  const groups = new Map<number, StatusEntry[]>()

  const add = (status: number, entry: StatusEntry) => {
    const list = groups.get(status) ?? []
    if (list.some((existing) => existing.code === entry.code)) {
      return
    }
    list.push(entry)
    groups.set(status, list)
  }

  for (const err of proc.errors) {
    add(err.status ?? 400, {
      code: err.code,
      description: err.message ?? err.code,
      schema:
        options.sharedErrorRefs.get(err.code) ??
        procedureErrorRef(proc, err, options),
    })
  }

  if (options.includeProtocolErrors) {
    for (const err of options.catalog.protocolErrors) {
      if (SKIP_PROTOCOL.has(err.code)) {
        continue
      }
      if (err.code === 'VALIDATION' && proc.input === undefined) {
        continue
      }
      const schema = options.protocolRefs.get(err.code)
      if (schema === undefined) {
        continue
      }
      add(err.status, {
        code: err.code,
        description: err.code,
        schema,
      })
    }
  }

  const responses: Record<
    string,
    {
      description: string
      content: { 'application/json': { schema: JsonSchema } }
    }
  > = {}
  const statuses = [...groups.keys()].sort((a, b) => a - b)
  for (const status of statuses) {
    const entries = groups.get(status)
    if (entries === undefined || entries.length === 0) {
      continue
    }
    const first = entries[0]
    if (first === undefined) {
      continue
    }
    const schema =
      entries.length === 1
        ? first.schema
        : { oneOf: entries.map((entry) => entry.schema) }
    const description =
      entries.length === 1
        ? first.description
        : entries.map((entry) => entry.code).join(', ')
    responses[String(status)] = {
      description,
      content: {
        'application/json': { schema },
      },
    }
  }
  return responses
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
