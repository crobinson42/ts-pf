import { AlreadyCompletedError, BlankTitleError } from './errors.js'
import type { DomainEvent } from './events.js'
import type { TaskData } from './task-schema.js'

export class Task {
  private readonly events: DomainEvent[] = []

  private constructor(
    readonly id: string,
    readonly title: string,
    private completedAt: string | null,
  ) {}

  static create(input: { id: string; title: string }): Task {
    const title = input.title.trim()
    if (title.length === 0) {
      throw new BlankTitleError()
    }
    const task = new Task(input.id, title, null)
    task.events.push({ type: 'task.created', taskId: task.id, title })
    return task
  }

  static restore(data: TaskData): Task {
    return new Task(data.id, data.title, data.completedAt)
  }

  complete(now: string): void {
    if (this.completedAt !== null) {
      throw new AlreadyCompletedError(this.id)
    }
    this.completedAt = now
    this.events.push({
      type: 'task.completed',
      taskId: this.id,
      completedAt: now,
    })
  }

  pullEvents(): DomainEvent[] {
    return this.events.splice(0)
  }

  toData(): TaskData {
    return {
      id: this.id,
      title: this.title,
      completedAt: this.completedAt,
    }
  }
}
