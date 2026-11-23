import type { ValidationIssue } from '@ts-pf/contract'

export type IssuesToFieldErrorsOptions = {
  /**
   * Path of a nested object in the input, e.g. `['address']` or
   * `['items', 0]`. Only issues under it are kept, keyed relative to it, for
   * the `FormModel` that edits that object.
   */
  at?: ReadonlyArray<string | number>
}

/**
 * Map protocol `VALIDATION` issues to `FormModel.setErrors` input. An issue is
 * keyed by the first segment of its path (relative to `at`), the top-level
 * field a `FormModel` knows, so `['address', 'city']` lands on `address`. The
 * first issue per field wins. An issue with no path left is skipped.
 */
export function issuesToFieldErrors(
  issues: readonly ValidationIssue[],
  options: IssuesToFieldErrorsOptions = {},
): Partial<Record<string, string>> {
  const at = (options.at ?? []).map(String)
  const out: Record<string, string> = {}
  for (const issue of issues) {
    if (issue.path.length <= at.length) {
      continue
    }
    if (!at.every((segment, i) => String(issue.path[i]) === segment)) {
      continue
    }
    const key = String(issue.path[at.length])
    if (out[key] === undefined) {
      out[key] = issue.message
    }
  }
  return out
}
