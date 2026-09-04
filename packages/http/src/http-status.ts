import type { PFError } from '@ts-pf/protocol'

export const PROTOCOL_HTTP_STATUS = {
  BAD_REQUEST: 400,
  VALIDATION: 422,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL: 500,
} as const

export function httpStatus(error: PFError): number {
  if (error.local === true) {
    return 0
  }
  if (Object.hasOwn(PROTOCOL_HTTP_STATUS, error.code)) {
    return PROTOCOL_HTTP_STATUS[error.code as keyof typeof PROTOCOL_HTTP_STATUS]
  }
  return error.status
}
