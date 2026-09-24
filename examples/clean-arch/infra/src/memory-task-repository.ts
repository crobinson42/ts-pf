import type { TaskData, TaskRepository } from '@ts-pf/example-clean-arch-domain'

export class MemoryTaskRepository implements TaskRepository {
  private readonly rows = new Map<string, TaskData>()

  async get(id: string): Promise<TaskData | null> {
    return this.rows.get(id) ?? null
  }

  async list(): Promise<TaskData[]> {
    return [...this.rows.values()]
  }

  async save(task: TaskData): Promise<void> {
    this.rows.set(task.id, task)
  }
}
