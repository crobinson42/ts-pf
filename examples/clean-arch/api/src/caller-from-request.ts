import type { Caller } from '@ts-pf/example-clean-arch-app'

export function callerFromRequest(req: Request): Caller {
  const trace = req.headers.get('x-trace-id')
  const actor = req.headers.get('x-actor-id')
  return {
    traceId: trace && trace.length > 0 ? trace : crypto.randomUUID(),
    actorId: actor && actor.length > 0 ? actor : null,
  }
}
