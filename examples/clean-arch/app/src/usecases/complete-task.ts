import type {
  DomainEvent,
  TaskRepository,
} from '@ts-pf/example-clean-arch-domain'
import { Task } from '@ts-pf/example-clean-arch-domain'
import { requireActor } from '../guards/require-actor.js'
import { requireCanComplete } from '../guards/require-can-complete.js'
import type { Access } from '../ports/access.js'
import type { Clock } from '../ports/clock.js'
import { taskIdData, taskIdInputSchema, taskViewSchema } from '../schemas.js'
import { toView } from '../to-view.js'
import { useCase } from '../use-case.js'

export const completeTask = useCase('Complete a task')
  .deps<{
    tasks: TaskRepository
    clock: Clock
    access: Access
    publish(event: DomainEvent): Promise<void>
  }>()
  .caller(requireActor)
  .input(taskIdInputSchema)
  .caller(requireCanComplete)
  .output(taskViewSchema)
  .errors({
    NOT_FOUND: { data: taskIdData },
    ALREADY_COMPLETE: { data: taskIdData },
  })
  .run(async ({ deps, input, errors }) => {
    const data = await deps.tasks.get(input.id)
    if (!data) {
      throw errors.NOT_FOUND({ id: input.id })
    }
    if (data.completedAt !== null) {
      throw errors.ALREADY_COMPLETE({ id: input.id })
    }
    const task = Task.restore(data)
    task.complete(deps.clock.now())
    await deps.tasks.save(task.toData())
    // for (const event of task.pullEvents()) {
    //   await deps.publish(event)
    // }
    return toView(task)
  })
