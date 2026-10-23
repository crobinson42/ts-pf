import { type ErrorMap, validateSchema } from '@ts-pf/contract'
import { defined, isPFError, PFError } from '@ts-pf/protocol'
import type { ErrorFactory } from './middleware.js'

export function createErrorFactory(map: ErrorMap): ErrorFactory<ErrorMap> {
  const factory: ErrorFactory<ErrorMap> = {}
  for (const [code, def] of Object.entries(map)) {
    factory[code] = ((data?: unknown) => {
      throw new PFError({
        code,
        message: def.message ?? code,
        ...defined({ status: def.status, data }),
      })
    }) as ErrorFactory[string]
  }
  return factory
}

export async function finalizeDeclaredError(
  error: unknown,
  map: ErrorMap,
): Promise<never> {
  if (!isPFError(error)) {
    throw error
  }
  const def = map[error.code]
  if (def?.data === undefined) {
    throw error
  }
  const result = await validateSchema(def.data, error.data)
  if (!result.success) {
    // The bad payload never reaches the wire (`toJSON()` omits `cause`); the
    // original error is kept so the server log can show what was thrown.
    throw new PFError({
      code: 'INTERNAL',
      message: 'Internal server error',
      cause: error,
    })
  }
  throw new PFError({
    code: error.code,
    message: error.message,
    ...defined({ status: error.status, data: result.value }),
  })
}
