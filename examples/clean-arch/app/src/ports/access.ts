export interface Access {
  allows(input: {
    traceId: string
    actorId: string
    action: 'task.complete'
    taskId: string
  }): Promise<boolean>
}
