import { createHash } from 'node:crypto'
import { canonicalize, type ProcedureCatalog } from '@ts-pf/docs'

export function catalogHash(catalog: ProcedureCatalog): string {
  const json = JSON.stringify(canonicalize(catalog))
  const hex = createHash('sha256').update(json).digest('hex')
  return `sha256:${hex}`
}
