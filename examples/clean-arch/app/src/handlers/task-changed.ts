import {
  type DomainEvent,
  Task,
  type TaskRepository,
} from '@ts-pf/example-clean-arch-domain'
import type { ClientEvents } from '../ports/client-events.js'
import { toView } from '../to-view.js'

type HandlerPorts = {
  tasks: TaskRepository
  clientEvents: ClientEvents
}

export async function onDomainEvent(
  ports: HandlerPorts,
  event: DomainEvent,
): Promise<void> {
  switch (event.type) {
    case 'task.created':
      return publish(ports, event.taskId)
    case 'task.completed':
      return publish(ports, event.taskId)
    default: {
      const unreachable: never = event
      return unreachable
    }
  }
}

async function publish(ports: HandlerPorts, taskId: string): Promise<void> {
  const data = await ports.tasks.get(taskId)
  if (!data) {
    return
  }
  ports.clientEvents.publish({
    type: 'task.changed',
    task: toView(Task.restore(data)),
  })
}
