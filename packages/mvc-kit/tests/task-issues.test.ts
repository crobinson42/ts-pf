import { PFError } from '@ts-pf/protocol'
import { describe, expect, it, vi } from 'vitest'
import { taskIssues } from '../src/task-issues.js'

const issues = [{ path: ['name'], message: 'Required' }]

describe('taskIssues', () => {
  it('returns the issues of a VALIDATION PFError cause', () => {
    const cause = new PFError({ code: 'VALIDATION', data: { issues } })
    expect(taskIssues({ cause })).toEqual(issues)
  })

  it('is empty for another code, a non-PFError, or no cause', () => {
    expect(
      taskIssues({
        cause: new PFError({ code: 'NOT_FOUND', data: { issues } }),
      }),
    ).toEqual([])
    expect(taskIssues({ cause: new Error('boom') })).toEqual([])
    expect(
      taskIssues({ cause: { code: 'VALIDATION', data: { issues } } }),
    ).toEqual([])
    expect(taskIssues({ cause: null })).toEqual([])
  })

  it('is empty when a VALIDATION cause carries no issues array', () => {
    expect(taskIssues({ cause: new PFError({ code: 'VALIDATION' }) })).toEqual(
      [],
    )
    expect(
      taskIssues({
        cause: new PFError({ code: 'VALIDATION', data: { issues: 'x' } }),
      }),
    ).toEqual([])
  })

  it('recognises a PFError from another copy of @ts-pf/protocol', async () => {
    vi.resetModules()
    const copy = await import('@ts-pf/protocol')
    expect(copy.PFError).not.toBe(PFError)
    const cause = new copy.PFError({ code: 'VALIDATION', data: { issues } })
    expect(taskIssues({ cause })).toEqual(issues)
  })
})
