import type { ValidationIssue } from '@ts-pf/contract'
import { isPFError } from '@ts-pf/protocol'

/**
 * The `VALIDATION` issues behind a failed mvc-kit task, for
 * `issuesToFieldErrors`: `taskIssues(vm.async.submit)`. Takes anything with a
 * `cause` (mvc-kit `TaskState` fits). Empty unless the cause is a `PFError`
 * whose code is `VALIDATION`; the code itself is already `task.errorCode`.
 */
export function taskIssues(task: {
  readonly cause: unknown
}): readonly ValidationIssue[] {
  const { cause } = task
  if (!isPFError(cause) || cause.code !== 'VALIDATION') {
    return []
  }
  const issues = (cause.data as { issues?: unknown } | undefined)?.issues
  return Array.isArray(issues) ? (issues as ValidationIssue[]) : []
}
