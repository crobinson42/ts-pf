import {
  AlreadyCompletedError,
  BlankTitleError,
  Task,
} from '@ts-pf/example-clean-arch-domain'
import { describe, expect, it } from 'vitest'

const completedAt = '2026-09-22T00:00:00.000Z'

describe('Task', () => {
  it('trims the title and records task.created', () => {
    const task = Task.create({ id: '1', title: '  Ship  ' })

    expect(task.toData()).toEqual({
      id: '1',
      title: 'Ship',
      completedAt: null,
    })
    expect(task.pullEvents()).toEqual([
      { type: 'task.created', taskId: '1', title: 'Ship' },
    ])
    expect(task.pullEvents()).toEqual([])
  })

  it('rejects a blank title', () => {
    expect(() => Task.create({ id: '2', title: '   ' })).toThrow(
      BlankTitleError,
    )
  })

  it('records task.completed once', () => {
    const task = Task.create({ id: '1', title: 'Ship' })
    task.pullEvents()

    task.complete(completedAt)

    expect(task.toData()).toEqual({
      id: '1',
      title: 'Ship',
      completedAt,
    })
    expect(task.pullEvents()).toEqual([
      { type: 'task.completed', taskId: '1', completedAt },
    ])
    expect(() => task.complete(completedAt)).toThrow(AlreadyCompletedError)
  })

  it('restores persisted data without replaying events', () => {
    const task = Task.create({ id: '1', title: 'Ship' })
    task.complete(completedAt)
    const restored = Task.restore(task.toData())

    expect(restored.pullEvents()).toEqual([])
    expect(() => restored.complete(completedAt)).toThrow(AlreadyCompletedError)
  })
})
