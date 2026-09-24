import type { Caller } from '../caller.js'
import { useCase } from '../use-case.js'
import { forbidden } from './forbidden.js'

export const requireActor = useCase.guard.errors(forbidden).narrow(
  (
    ctx,
  ): ctx is {
    caller: Caller & { actorId: string }
    errors: typeof ctx.errors
  } => {
    if (
      typeof ctx.caller.actorId !== 'string' ||
      ctx.caller.actorId.length === 0
    ) {
      ctx.errors.FORBIDDEN()
    }
    return true
  },
)
