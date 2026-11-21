import type { ErrorMap } from './errors.js'
import type { ContractExpandDef } from './expand.js'
import type { AnySchema } from './schema.js'

export interface ContractProcedureDef<
  TErrors extends ErrorMap = ErrorMap,
  TMeta = {},
> {
  type: 'procedure'
  input?: AnySchema
  output?: AnySchema
  /** Set by `.expand()`: the schemas behind `Expansion['fields']`. */
  expand?: ContractExpandDef
  errors: TErrors
  meta: TMeta
}

/**
 * `TInput` is what a caller sends (the input schema's input type, so a
 * `.default()` field is optional); `TParsedInput` is what the handler
 * receives after the input check (the schema's output type). They default
 * to the same type, so a hand-written `ContractProcedure<I, O>` (codegen
 * output) describes both. `TExpand` is an `Expansion` (`.expand()`), or
 * `never` for a procedure whose output does not follow its input.
 */
export interface ContractProcedure<
  TInput = void,
  TOutput = unknown,
  TErrors extends ErrorMap = {},
  TMeta = {},
  TParsedInput = TInput,
  TExpand = never,
> {
  readonly '~pf': ContractProcedureDef<TErrors, TMeta>
  readonly '~types'?: {
    input: TInput
    parsedInput: TParsedInput
    output: TOutput
    expand: TExpand
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
