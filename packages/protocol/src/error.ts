export type PFErrorInit<TCode extends string = string, TData = unknown> = {
  code: TCode
  /**
   * Transport metadata, not identity. Set by the server from a declared
   * `ErrorDef.status` and by `FetchLink` from the HTTP response. Absent on
   * message transports, on mid-stream failures, and when nothing declared
   * one; `httpStatus()` in `@ts-pf/http` supplies the HTTP default (400).
   */
  status?: number
  message?: string
  data?: TData
  cause?: unknown
  local?: true
}

export class PFError<
  TCode extends string = string,
  TData = unknown,
> extends Error {
  readonly code: TCode
  readonly status?: number
  readonly data?: TData
  readonly local?: true

  constructor(init: PFErrorInit<TCode, TData>) {
    const message = init.message ?? init.code
    if ('cause' in init) {
      super(message, { cause: init.cause })
    } else {
      super(message)
    }
    this.name = 'PFError'
    this.code = init.code
    if (init.status !== undefined) {
      this.status = init.status
    }
    if (init.data !== undefined) {
      this.data = init.data
    }
    if (init.local === true) {
      this.local = true
    }
  }

  toJSON(): { code: TCode; message: string; data?: TData } {
    const json: { code: TCode; message: string; data?: TData } = {
      code: this.code,
      message: this.message,
    }
    if (this.data !== undefined) {
      json.data = this.data
    }
    return json
  }
}

// Cross-copy brand. Two copies of this package (version skew, a bundler that
// inlines one) make `instanceof` fail across the boundary, so a typed error
// would reach `toWireError` as an unknown throw. The registry symbol is the
// same in every copy. It lives on the prototype, not on each instance, so
// construction stays as cheap as before and instances gain no own property.
const PF_ERROR_BRAND = Symbol.for('ts-pf.PFError')

Object.defineProperty(PFError.prototype, PF_ERROR_BRAND, { value: true })

/** `true` for a `PFError` from this or any other copy of `@ts-pf/protocol`. */
export function isPFError(value: unknown): value is PFError {
  return (
    value instanceof PFError ||
    (typeof value === 'object' &&
      value !== null &&
      (value as { [PF_ERROR_BRAND]?: unknown })[PF_ERROR_BRAND] === true)
  )
}

export function localFailure(message: string, cause?: unknown): PFError {
  return new PFError({
    code: 'INTERNAL',
    status: 0,
    local: true,
    message,
    ...(cause !== undefined ? { cause } : {}),
  })
}

export const ProtocolErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL: 'INTERNAL',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
} as const
