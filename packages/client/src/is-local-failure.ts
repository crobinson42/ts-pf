import { isPFError, type PFError } from '@ts-pf/protocol'

export function isLocalFailure(
  error: unknown,
): error is PFError & { status: 0 } {
  return isPFError(error) && error.status === 0
}
