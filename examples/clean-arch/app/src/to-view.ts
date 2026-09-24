import type { Task } from '@ts-pf/example-clean-arch-domain'
import type { TaskView } from './schemas.js'

export function toView(task: Task): TaskView {
  const data = task.toData()
  return {
    id: data.id,
    title: data.title,
    completed: data.completedAt !== null,
  }
}
