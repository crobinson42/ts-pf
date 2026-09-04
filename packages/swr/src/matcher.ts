import { generateSwrKey } from './key.js'
import type { SwrMatcher, SwrMatcherStrategy } from './types.js'

export function isSubsetOf(subset: unknown, full: unknown): boolean {
  if (subset === full) {
    return true
  }
  if (typeof subset !== typeof full) {
    return false
  }
  if (isPlainObject(subset) && isPlainObject(full)) {
    return Object.keys(subset).every(
      (key) => subset[key] === undefined || isSubsetOf(subset[key], full[key]),
    )
  }
  if (Array.isArray(subset) && Array.isArray(full)) {
    return subset.every((value, index) => isSubsetOf(value, full[index]))
  }
  return false
}

export function createMatcher(
  path: readonly string[],
  prefix?: string,
  input?: unknown,
  strategy: SwrMatcherStrategy = 'partial',
): SwrMatcher {
  const expected = generateSwrKey(path, prefix, input)
  return (key) => {
    if (!isSubsetOf(expected, key)) {
      return false
    }
    if (strategy === 'exact' && !isSubsetOf(key, expected)) {
      return false
    }
    return true
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
