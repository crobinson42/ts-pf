import type { TaskRepository } from '@ts-pf/example-clean-arch-domain'
import { Task } from '@ts-pf/example-clean-arch-domain'
import { requireActor } from '../guards/require-actor.js'
import { taskIdData, taskIdInputSchema, taskViewSchema } from '../schemas.js'
import { toView } from '../to-view.js'
import { useCase } from '../use-case.js'

export const getTask = useCase('Get a task')
  .deps<{ tasks: TaskRepository }>()
  .caller(requireActor)
  .input(taskIdInputSchema)
  .output(taskViewSchema)
  .errors({ NOT_FOUND: { data: taskIdData } })
  .run(async ({ deps, input, errors }) => {
    const data = await deps.tasks.get(input.id)
    if (!data) {
      throw errors.NOT_FOUND({ id: input.id })
    }
    return toView(Task.restore(data))
  })
