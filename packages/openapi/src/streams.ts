import type { CatalogProcedure } from '@ts-pf/docs'
import { operationErrors } from './errors.js'
import { type OperationContext, procedureSchemas } from './operation.js'
import { errorCodes } from './shared-errors.js'
import type { OpenAPIStreamEntry } from './types.js'

/** A procedure whose input or output is a stream. */
export function isStreamProcedure(proc: CatalogProcedure): boolean {
  return proc.input?.kind === 'stream' || proc.output?.kind === 'stream'
}

/**
 * `streams: 'components'`: the procedure's `x-ts-pf-streams` entry instead
 * of an operation. Its schemas are the same `<path>.Input` / `<path>.Output`
 * components the operation would use; `errors` lists the codes it can
 * return, as `x-ts-pf-errors` does on an operation.
 */
export function streamEntry(
  proc: CatalogProcedure,
  options: OperationContext,
): OpenAPIStreamEntry {
  const { input, output } = procedureSchemas(proc, options)
  const entry: Omit<OpenAPIStreamEntry, 'errors'> = {}
  if (input !== undefined) {
    entry[proc.input?.kind === 'stream' ? 'inputItem' : 'input'] = input
  }
  if (output !== undefined) {
    entry[proc.output?.kind === 'stream' ? 'item' : 'output'] = output
  }
  const errors = operationErrors(
    proc,
    options.catalog,
    options.includeProtocolErrors,
  )
  return { ...entry, errors: errorCodes(errors) }
}
