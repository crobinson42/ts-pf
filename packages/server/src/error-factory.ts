import { type ErrorMap, validateSchema } from '@ts-pf/contract'
import { isPFError, PFError, type PFErrorInit } from '@ts-pf/protocol'
import type { ErrorFactory } from './middleware.js'

// A factory depends only on its error map, so each map gets one, shared by
// every call of the procedures that declare it, and frozen so no handler can
// change what another call sees. Weak: a contract that is garbage-collected
// takes its factory with it.
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
  Object.freeze(factory)
  factories.set(map, factory)
  return factory
}

/**
 * A thrown `PFError` whose code the procedure declares leaves with the
 * declared `status` when it has none (the same stamping as `errors.X()`, so a
 * hand-built `new PFError({ code })` matches) and with its `data` parsed by
 * the declared schema. Anything else is rethrown untouched.
 */
export async function finalizeDeclaredError(
  error: unknown,
  map: ErrorMap,
): Promise<never> {
  if (!isPFError(error)) {
    throw error
  }
  const def = map[error.code]
  if (def === undefined) {
    throw error
  }
  const status = error.status ?? def.status
  if (def.data === undefined) {
    throw status === error.status ? error : rebuild(error, status, error.data)
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
  throw rebuild(error, status, result.value)
}

// `PFError` fields are readonly, so a finalized error is a copy that keeps
// everything the constructor takes (including `cause`) and the throw-site stack.
function rebuild(
  error: PFError,
  status: number | undefined,
  data: unknown,
): PFError {
  const init: PFErrorInit = { code: error.code, message: error.message }
  if (status !== undefined) {
    init.status = status
  }
  if (data !== undefined) {
    init.data = data
  }
  if ('cause' in error) {
    init.cause = error.cause
  }
  if (error.local === true) {
    init.local = true
  }
  const copy = new PFError(init)
  if (error.stack !== undefined) {
    copy.stack = error.stack
  }
  return copy
}
