import { type ErrorMap, validateSchema } from '@ts-pf/contract'
import { isPFError, PFError } from '@ts-pf/protocol'
import type { ErrorFactory } from './middleware.js'

export function createErrorFactory(map: ErrorMap): ErrorFactory<ErrorMap> {
  const factory: ErrorFactory<ErrorMap> = {}
  for (const [code, def] of Object.entries(map)) {
    factory[code] = ((data?: unknown) => {
      throw new PFError({
        code,
        status: def.status ?? 400,
        message: def.message ?? code,
        ...(data !== undefined ? { data } : {}),
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
    throw new PFError({
      code: 'INTERNAL',
      status: 500,
      message: 'Internal server error',
    })
  }
  throw new PFError({
    code: error.code,
    status: error.status,
    message: error.message,
    ...(result.value !== undefined ? { data: result.value } : {}),
  })
}
