import { createHash } from 'node:crypto'
import type { ProcedureCatalog } from '@ts-pf/docs'

export function catalogHash(catalog: ProcedureCatalog): string {
  const json = JSON.stringify(canonicalize(catalog))
  const hex = createHash('sha256').update(json).digest('hex')
  return `sha256:${hex}`
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  const input = value as Record<string, unknown>
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(input).sort()) {
    output[key] = canonicalize(input[key])
  }
  return output
}
