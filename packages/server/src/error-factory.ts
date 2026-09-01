import type { ErrorMap } from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
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
