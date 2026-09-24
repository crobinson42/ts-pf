import type { TaskData } from '../task-schema.js'

export interface TaskRepository {
  get(id: string): Promise<TaskData | null>
  list(): Promise<TaskData[]>
  save(task: TaskData): Promise<void>
}
