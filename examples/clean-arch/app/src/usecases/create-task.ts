import type {
  DomainEvent,
  TaskRepository,
} from '@ts-pf/example-clean-arch-domain'
import { Task } from '@ts-pf/example-clean-arch-domain'
import { requireActor } from '../guards/require-actor.js'
import type { IdGenerator } from '../ports/ids.js'
import { createTaskInputSchema, taskViewSchema } from '../schemas.js'
import { toView } from '../to-view.js'
import { useCase } from '../use-case.js'

export const createTask = useCase('Create a task')
  .deps<{
    tasks: TaskRepository
    ids: IdGenerator
    publish(event: DomainEvent): Promise<void>
  }>()
  .caller(requireActor)
  .input(createTaskInputSchema)
  .output(taskViewSchema)
  .run(async ({ deps, input }) => {
    const task = Task.create({ id: deps.ids.next(), title: input.title })
    await deps.tasks.save(task.toData())
    for (const event of task.pullEvents()) {
      await deps.publish(event)
    }
    return toView(task)
  })
