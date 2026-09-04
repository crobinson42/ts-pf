export type PFErrorInit<TCode extends string = string, TData = unknown> = {
  code: TCode
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
  readonly status: number
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
    this.status = init.status ?? 400
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

export function isPFError(value: unknown): value is PFError {
  return value instanceof PFError
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
