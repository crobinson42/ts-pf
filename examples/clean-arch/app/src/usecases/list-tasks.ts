import type { TaskRepository } from '@ts-pf/example-clean-arch-domain'
import { Task } from '@ts-pf/example-clean-arch-domain'
import { z } from 'zod'
import { taskViewSchema } from '../schemas.js'
import { toView } from '../to-view.js'
import { useCase } from '../use-case.js'

export const listTasks = useCase('List tasks')
  .deps<{ tasks: TaskRepository }>()
  .output(z.array(taskViewSchema))
  .run(async ({ deps }) => {
    const rows = await deps.tasks.list()
    return rows.map((row) => toView(Task.restore(row)))
  })
