import { PFError } from '@ts-pf/protocol'

const PROTOCOL_STATUS: Record<string, number> = {
  BAD_REQUEST: 400,
  VALIDATION: 422,
  NOT_FOUND: 404,
  INTERNAL: 500,
  METHOD_NOT_ALLOWED: 405,
  PAYLOAD_TOO_LARGE: 413,
}

export function errorFromEnvelope(error: {
  code: string
  message: string
  data?: unknown
}): PFError {
  const known = PROTOCOL_STATUS[error.code]
  return new PFError({
    code: error.code,
    status: known ?? 400,
    message: error.message,
    ...(error.data !== undefined ? { data: error.data } : {}),
  })
}

export function localFailure(message: string, cause?: unknown): PFError {
  return new PFError({
    code: 'INTERNAL',
    status: 0,
    message,
    ...(cause !== undefined ? { cause } : {}),
  })
}
