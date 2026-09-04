import { PFError } from '@ts-pf/protocol'

export { localFailure } from '@ts-pf/protocol'

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
