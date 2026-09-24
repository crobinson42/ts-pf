import type {
  DomainEvent,
  TaskRepository,
} from '@ts-pf/example-clean-arch-domain'
import { onDomainEvent } from './handlers/task-changed.js'
import type { Access } from './ports/access.js'
import type { ClientEvents } from './ports/client-events.js'
import type { Clock } from './ports/clock.js'
import type { IdGenerator } from './ports/ids.js'

export type AppPorts = {
  tasks: TaskRepository
  ids: IdGenerator
  clock: Clock
  clientEvents: ClientEvents
  access: Access
}

export type AppDeps = AppPorts & {
  publish(event: DomainEvent): Promise<void>
}

export function createAppDeps(ports: AppPorts): AppDeps {
  return {
    ...ports,
    publish(event) {
      return onDomainEvent(
        { tasks: ports.tasks, clientEvents: ports.clientEvents },
        event,
      )
    },
  }
}
