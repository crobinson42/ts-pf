export class BlankTitleError extends Error {
  constructor() {
    super('Title is blank')
    this.name = 'BlankTitleError'
  }
}

export class AlreadyCompletedError extends Error {
  constructor(readonly taskId: string) {
    super('Task is already complete')
    this.name = 'AlreadyCompletedError'
  }
}
