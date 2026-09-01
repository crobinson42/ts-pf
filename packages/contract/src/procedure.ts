import type { ErrorMap } from './errors.js'
import type { AnySchema } from './schema.js'

export interface ContractProcedureDef<
  TErrors extends ErrorMap = ErrorMap,
  TMeta = {},
> {
  type: 'procedure'
  input?: AnySchema
  output?: AnySchema
  errors: TErrors
  meta: TMeta
}

export interface ContractProcedure<
  TInput = void,
  TOutput = unknown,
  TErrors extends ErrorMap = {},
  TMeta = {},
> {
  readonly '~pf': ContractProcedureDef<TErrors, TMeta>
  readonly '~types'?: { input: TInput; output: TOutput }
}

export function isContractProcedure(
  value: unknown,
): value is ContractProcedure {
  return (
    typeof value === 'object' &&
    value !== null &&
    '~pf' in value &&
    (value as ContractProcedure)['~pf']?.type === 'procedure'
  )
}
