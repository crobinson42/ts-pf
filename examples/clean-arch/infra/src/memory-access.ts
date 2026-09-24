import type { Access } from '@ts-pf/example-clean-arch-app'

export class MemoryAccess implements Access {
  constructor(private readonly allowed: ReadonlySet<string>) {}

  async allows(input: {
    traceId: string
    actorId: string
    action: 'task.complete'
    taskId: string
  }): Promise<boolean> {
    return this.allowed.has(input.actorId)
  }
}
