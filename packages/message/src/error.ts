import { PFError, localFailure as protocolLocalFailure } from '@ts-pf/protocol'

/**
 * @deprecated Import `localFailure` from `@ts-pf/protocol`. This re-export
 * stays for compatibility; it is the same function.
 */
export const localFailure = protocolLocalFailure

export function errorFromEnvelope(error: {
  code: string
  message: string
  data?: unknown
}): PFError {
  return new PFError({
    code: error.code,
    message: error.message,
    ...(error.data !== undefined ? { data: error.data } : {}),
  })
}
