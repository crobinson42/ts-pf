export const DOCS_KEY = 'docs' as const

export interface DocsMeta {
  description?: string
  summary?: string
  tags?: string[]
  deprecated?: boolean
  hidden?: boolean
}

export function docs(value: DocsMeta): { [DOCS_KEY]: DocsMeta } {
  return { [DOCS_KEY]: value }
}

export function getDocs(meta: Record<string, unknown>): DocsMeta | undefined {
  const value = meta[DOCS_KEY]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  return value as DocsMeta
}
