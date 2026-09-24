import type { ClientEvent, ClientEvents } from '@ts-pf/example-clean-arch-app'
import { watchTasks } from '@ts-pf/example-clean-arch-app'
import { describe, expect, it } from 'vitest'

function events() {
  const listeners = new Set<(event: ClientEvent) => void>()
  const clientEvents: ClientEvents = {
    publish(event) {
      for (const listener of listeners) {
        listener(event)
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  return { clientEvents, listeners }
}

const task = {
  type: 'task.changed' as const,
  task: { id: 'task-1', title: 'Write plan', completed: false },
}

describe('watchTasks', () => {
  it('rejects a missing actor before subscribing', async () => {
    const { clientEvents, listeners } = events()
    const result = await watchTasks({
      deps: { clientEvents },
      caller: { traceId: 't-1', actorId: null },
    })
    expect(result).toEqual({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(listeners.size).toBe(0)
  })

  it('yields events after the actor guard and unsubscribes on abort', async () => {
    const { clientEvents, listeners } = events()
    const controller = new AbortController()
    const result = await watchTasks({
      deps: { clientEvents },
      caller: { traceId: 't-1', actorId: 'ada' },
      signal: controller.signal,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    const iterator = result.data[Symbol.asyncIterator]()
    const pending = iterator.next()
    expect(listeners.size).toBe(1)
    clientEvents.publish(task)
    await expect(pending).resolves.toEqual({ done: false, value: task })
    controller.abort()
    await iterator.return?.()
    expect(listeners.size).toBe(0)
  })
})
