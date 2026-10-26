import { type ErrorMap, validateSchema } from '@ts-pf/contract'
import { isPFError, PFError, type PFErrorInit } from '@ts-pf/protocol'
import type { ErrorFactory } from './middleware.js'

// A factory depends only on its error map, so each map gets one, shared by
// every call of the procedures that declare it. Weak: a contract that is
// garbage-collected takes its factory with it.
const factories = new WeakMap<ErrorMap, ErrorFactory<ErrorMap>>()

export function createErrorFactory(map: ErrorMap): ErrorFactory<ErrorMap> {
  const cached = factories.get(map)
  if (cached) {
    return cached
  }
  const factory: ErrorFactory<ErrorMap> = {}
  for (const [code, def] of Object.entries(map)) {
    const message = def.message ?? code
    const status = def.status
    factory[code] = ((data?: unknown) => {
      const init: PFErrorInit = { code, message }
      if (status !== undefined) {
        init.status = status
      }
      if (data !== undefined) {
        init.data = data
      }
      throw new PFError(init)
    }) as ErrorFactory[string]
  }
  factories.set(map, factory)
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
  const init: PFErrorInit = { code: error.code, message: error.message }
  if (error.status !== undefined) {
    init.status = error.status
  }
  if (result.value !== undefined) {
    init.data = result.value
  }
  throw new PFError(init)
}
