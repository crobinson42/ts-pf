import {
  type ClientEvent,
  type ClientEvents,
  createAppDeps,
  createTask,
} from '@ts-pf/example-clean-arch-app'
import type { TaskData, TaskRepository } from '@ts-pf/example-clean-arch-domain'
import { describe, expect, it } from 'vitest'

describe('createTask', () => {
  it('saves the task and publishes task.changed', async () => {
    const saved: TaskData[] = []
    const published: ClientEvent[] = []
    const tasks: TaskRepository = {
      async get(id) {
        return saved.find((row) => row.id === id) ?? null
      },
      async list() {
        return [...saved]
      },
      async save(task) {
        const index = saved.findIndex((row) => row.id === task.id)
        if (index === -1) {
          saved.push(task)
          return
        }
        saved[index] = task
      },
    }
    const clientEvents: ClientEvents = {
      publish(event) {
        published.push(event)
      },
      subscribe() {
        return () => {}
      },
    }
    const deps = createAppDeps({
      tasks,
      ids: { next: () => 'task-1' },
      clock: { now: () => '2026-09-22T00:00:00.000Z' },
      clientEvents,
      access: { allows: async () => true },
    })

    const result = await createTask({
      deps,
      caller: { traceId: 't-1', actorId: 'ada' },
      input: { title: 'Write plan' },
    })

    expect(result).toEqual({
      ok: true,
      data: {
        id: 'task-1',
        title: 'Write plan',
        completed: false,
      },
    })
    expect(saved).toEqual([
      { id: 'task-1', title: 'Write plan', completedAt: null },
    ])
    expect(published).toEqual([
      {
        type: 'task.changed',
        task: { id: 'task-1', title: 'Write plan', completed: false },
      },
    ])
  })
})
