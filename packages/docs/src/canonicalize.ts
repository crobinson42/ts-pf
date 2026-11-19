/**
 * A copy of a JSON value with every object's keys sorted (arrays keep their
 * order), so `JSON.stringify` of the result is byte-stable for equal values.
 * `catalogHash()` in `@ts-pf/codegen` hashes it; `@ts-pf/openapi` uses it for
 * sorted output.
 */
export function canonicalize<T>(value: T): T {
  return sortKeys(value) as T
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }
  const input = value as Record<string, unknown>
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(input).sort()) {
    output[key] = sortKeys(input[key])
  }
  return output
}
