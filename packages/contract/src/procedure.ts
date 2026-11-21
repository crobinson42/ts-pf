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

/**
 * `TInput` is what a caller sends (the input schema's input type, so a
 * `.default()` field is optional); `TParsedInput` is what the handler
 * receives after the input check (the schema's output type). They default
 * to the same type, so a hand-written `ContractProcedure<I, O>` (codegen
 * output) describes both.
 */
export interface ContractProcedure<
  TInput = void,
  TOutput = unknown,
  TErrors extends ErrorMap = {},
  TMeta = {},
  TParsedInput = TInput,
> {
  readonly '~pf': ContractProcedureDef<TErrors, TMeta>
  readonly '~types'?: {
    input: TInput
    parsedInput: TParsedInput
    output: TOutput
  }
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
