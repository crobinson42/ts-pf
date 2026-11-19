import type { ValidationIssue } from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'

/**
 * The `VALIDATION` error `runProcedure` throws when the input check fails:
 * code `VALIDATION`, message `Validation failed`, `data: { issues }`, no
 * `status` (`httpStatus()` maps it to 422). Throw it from a handler that
 * validates on its own, e.g. under `validation.input: false`, with
 * `toValidationIssues` from `@ts-pf/contract` for Standard Schema issues.
 */
export function validationError(
  issues: ReadonlyArray<ValidationIssue>,
): PFError {
  return new PFError({
    code: 'VALIDATION',
    message: 'Validation failed',
    data: { issues },
  })
}
