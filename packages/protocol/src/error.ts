export type PFErrorInit<TCode extends string = string, TData = unknown> = {
  code: TCode
  status?: number
  message?: string
  data?: TData
}

export class PFError<
  TCode extends string = string,
  TData = unknown,
> extends Error {
  readonly code: TCode
  readonly status: number
  readonly data?: TData

  constructor(init: PFErrorInit<TCode, TData>) {
    super(init.message ?? init.code)
    this.name = 'PFError'
    this.code = init.code
    this.status = init.status ?? 400
    if (init.data !== undefined) {
      this.data = init.data
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

export const ProtocolErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL: 'INTERNAL',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
} as const
