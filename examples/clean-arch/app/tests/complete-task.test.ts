import {
  type ClientEvents,
  completeTask,
  createAppDeps,
} from '@ts-pf/example-clean-arch-app'
import type { TaskData, TaskRepository } from '@ts-pf/example-clean-arch-domain'
import { describe, expect, it } from 'vitest'

const caller = { traceId: 't-1', actorId: 'ada' as string | null }

function harness(accessAllows = true) {
  const saved: TaskData[] = []
  const calls: Array<{
    traceId: string
    actorId: string
    action: 'task.complete'
    taskId: string
  }> = []
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
    publish() {},
    subscribe() {
      return () => {}
    },
  }
  const deps = createAppDeps({
    tasks,
    ids: { next: () => 'task-1' },
    clock: { now: () => '2026-09-22T00:00:00.000Z' },
    clientEvents,
    access: {
      async allows(input) {
        calls.push(input)
        return accessAllows
      },
    },
  })
  return { deps, calls, saved, tasks }
}

describe('completeTask', () => {
  it('rejects a missing actor before reading access or the repository', async () => {
    const { deps, calls } = harness()
    const result = await completeTask({
      deps,
      caller: { traceId: 't-1', actorId: null },
      input: { id: 'task-1' },
    })
    expect(result).toEqual({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(calls).toEqual([])
  })

  it('rejects a blank id before the access check', async () => {
    const { deps, calls } = harness()
    const result = await completeTask({
      deps,
      caller,
      input: { id: '' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID')
    }
    expect(calls).toEqual([])
  })

  it('records the trace id when access denies the actor', async () => {
    const { deps, calls } = harness(false)
    const result = await completeTask({
      deps,
      caller,
      input: { id: 'task-1' },
    })
    expect(result).toEqual({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(calls).toEqual([
      {
        traceId: 't-1',
        actorId: 'ada',
        action: 'task.complete',
        taskId: 'task-1',
      },
    ])
  })

  it('returns NOT_FOUND after access allows a missing row', async () => {
    const { deps, calls } = harness()
    const result = await completeTask({
      deps,
      caller,
      input: { id: 'missing' },
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', data: { id: 'missing' } },
    })
    expect(calls).toHaveLength(1)
  })

  it('propagates an unexpected repository error', async () => {
    const { deps, tasks } = harness()
    tasks.get = () => Promise.reject(new Error('db down'))
    await expect(
      completeTask({
        deps,
        caller,
        input: { id: 'task-1' },
      }),
    ).rejects.toThrow('db down')
  })
})
