export { AlreadyCompletedError, BlankTitleError } from './errors.js'
export {
  type DomainEvent,
  domainEventSchema,
  taskCompletedSchema,
  taskCreatedSchema,
} from './events.js'
export type { TaskRepository } from './ports/task-repository.js'
export { Task } from './task.js'
export { type TaskData, taskDataSchema } from './task-schema.js'
