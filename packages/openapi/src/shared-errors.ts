import type { JsonSchema, ProcedureCatalog } from '@ts-pf/docs'
import { innerFromCatalog, sharedFailureEnvelope } from './envelope.js'
import { errorData, type OperationError, operationErrors } from './errors.js'
import { type Hoister, shapeKey } from './hoist.js'
import { operationId, pascalCase } from './names.js'
import { putSchema } from './refs.js'

/** A code's `data` schema and the procedures that declare it. */
type CodeData = { data: JsonSchema; shape: string; owners: string[] }

/**
 * `errors: 'shared'`: writes `ErrorCode` (every code an operation can
 * return), `RpcError` (the one failure envelope), and one `<Code>Data` per
 * code with data (`ValidationErrorData` for protocol `VALIDATION`). Returns
 * a `$ref` to `RpcError`, or `undefined` when no operation has an error.
 * Throws when procedures declare one code with two `data` shapes.
 */
export function sharedErrorComponents(
  catalog: ProcedureCatalog,
  schemas: Record<string, JsonSchema>,
  hoister: Hoister,
  includeProtocolErrors: boolean,
): JsonSchema | undefined {
  const reachable = new Set(
    catalog.procedures.flatMap((proc) =>
      operationErrors(proc, catalog, includeProtocolErrors).map((e) => e.code),
    ),
  )
  const declared = declaredData(catalog)
  const protocol = catalog.protocolErrors.filter(
    (err) => reachable.has(err.code) && !declared.codes.includes(err.code),
  )
  const codes = [...declared.codes, ...protocol.map((err) => err.code)]
  if (codes.length === 0) {
    return undefined
  }

  const codeRef = putSchema(schemas, 'ErrorCode', {
    type: 'string',
    enum: codes,
  })
  const ref = putSchema(schemas, 'RpcError', sharedFailureEnvelope(codeRef))
  for (const [code, entry] of declared.data) {
    hoister.add(
      `${pascalCase(code)}Data`,
      'output',
      entry.owners.join(', '),
      entry.data,
    )
  }
  for (const err of protocol) {
    if (err.data !== undefined) {
      hoister.add(
        `${pascalCase(err.code)}ErrorData`,
        'output',
        'protocol errors',
        innerFromCatalog(err.data) ?? {},
      )
    }
  }
  return ref
}

/** `x-ts-pf-errors`: the operation's codes in response (status) order. */
export function errorCodes(errors: readonly OperationError[]): string[] {
  const sorted = [...errors].sort((a, b) => a.status - b.status)
  return [...new Set(sorted.map((error) => error.code))]
}

/**
 * Declared codes in first-seen order, and the one `data` schema of each
 * code that has data. A procedure that declares the code without data
 * agrees with any shape (`data` is optional on the envelope).
 */
function declaredData(catalog: ProcedureCatalog): {
  codes: string[]
  data: Map<string, CodeData>
} {
  const codes: string[] = []
  const data = new Map<string, CodeData>()
  for (const proc of catalog.procedures) {
    for (const err of proc.errors) {
      if (!codes.includes(err.code)) {
        codes.push(err.code)
      }
      const schema = errorData(err)
      if (schema === undefined) {
        continue
      }
      const owner = operationId(proc.path)
      const shape = shapeKey(schema, 'output')
      const entry = data.get(err.code)
      if (entry === undefined) {
        data.set(err.code, { data: schema, shape, owners: [owner] })
        continue
      }
      if (entry.shape !== shape) {
        throw new Error(
          `openapi(): error code "${err.code}" has different data shapes (${[...entry.owners, owner].join(', ')}). errors: 'shared' needs one shape per code: declare one shape per code or rename one.`,
        )
      }
      entry.owners.push(owner)
    }
  }
  return { codes, data }
}
