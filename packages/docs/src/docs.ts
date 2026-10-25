export const DOCS_KEY = 'docs' as const

export interface DocsMeta {
  description?: string
  summary?: string
  tags?: string[]
  deprecated?: boolean
  hidden?: boolean
}

/** `DocsMeta` with `tags` / `hidden` kept literal when given, so `@ts-pf/mcp` can filter on them in types. */
type TypedDocs<Tags extends string[], Hidden extends boolean> = Omit<
  DocsMeta,
  'tags' | 'hidden'
> &
  ([Tags] extends [never] ? {} : { tags: Tags }) &
  ([Hidden] extends [never] ? {} : { hidden: Hidden })

export function docs<
  const Tags extends string[] = never,
  const Hidden extends boolean = never,
>(
  value: Omit<DocsMeta, 'tags' | 'hidden'> & { tags?: Tags; hidden?: Hidden },
): { [DOCS_KEY]: TypedDocs<Tags, Hidden> } {
  return { [DOCS_KEY]: value as TypedDocs<Tags, Hidden> }
}

export function getDocs(meta: Record<string, unknown>): DocsMeta | undefined {
  const value = meta[DOCS_KEY]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  return value as DocsMeta
}
