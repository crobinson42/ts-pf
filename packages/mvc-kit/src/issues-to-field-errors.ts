import type { ValidationIssue } from '@ts-pf/contract'

/**
 * Flatten protocol `VALIDATION` issues into `FormModel.setErrors` input.
 * First issue per dotted path wins. Empty paths are skipped.
 */
export function issuesToFieldErrors(
  issues: readonly ValidationIssue[],
): Partial<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    if (issue.path.length === 0) {
      continue
    }
    const key = issue.path.map(String).join('.')
    if (out[key] === undefined) {
      out[key] = issue.message
    }
  }
  return out
}
