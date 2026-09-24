import type { Caller } from '../caller.js'
import type { Access } from '../ports/access.js'
import { useCase } from '../use-case.js'
import { forbidden } from './forbidden.js'

export const requireCanComplete = useCase.guard.errors(forbidden).check<{
  caller: Caller & { actorId: string }
  deps: { access: Access }
  input: { id: string }
}>(async ({ caller, deps, input, errors }) => {
  const allowed = await deps.access.allows({
    traceId: caller.traceId,
    actorId: caller.actorId,
    action: 'task.complete',
    taskId: input.id,
  })
  if (!allowed) {
    errors.FORBIDDEN()
  }
  return true
})
