import type {
  CatalogProcedure,
  JsonSchema,
  ProcedureCatalog,
} from '@ts-pf/docs'
import { failureEnvelope, innerFromCatalog } from './envelope.js'
import { protocolErrorSchemaName, schemaName } from './names.js'
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
): Map<string, JsonSchema> {
  const refs = new Map<string, JsonSchema>()
  for (const err of catalog.protocolErrors) {
    const name = protocolErrorSchemaName(err.code)
    const data = innerFromCatalog(err.data)
    refs.set(
      err.code,
      putSchema(schemas, name, failureEnvelope(err.code, data)),
    )
  }
  return refs
}

export function operationErrorResponses(
  proc: CatalogProcedure,
  options: {
    includeProtocolErrors: boolean
    catalog: ProcedureCatalog
    schemas: Record<string, JsonSchema>
    protocolRefs: Map<string, JsonSchema>
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
    const status = err.status ?? 400
    const name = schemaName(proc.path, `Error.${err.code}`)
    const data = innerFromCatalog(err.data)
    add(status, {
      code: err.code,
      description: err.message ?? err.code,
      schema: putSchema(options.schemas, name, failureEnvelope(err.code, data)),
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
