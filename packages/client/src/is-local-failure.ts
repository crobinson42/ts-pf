import { isPFError, type PFError } from '@ts-pf/protocol'

export function isLocalFailure(
  error: unknown,
): error is PFError & { local: true } {
  return isPFError(error) && error.local === true
}
