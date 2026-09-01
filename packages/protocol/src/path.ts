function normalizePrefix(prefix: string): string {
  const withLeading = prefix.startsWith('/') ? prefix : `/${prefix}`
  return withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading
}

export function joinProcedurePath(prefix: string, segments: readonly string[]): string {
  const base = normalizePrefix(prefix)
  if (segments.length === 0) {
    return base
  }
  return `${base}/${segments.join('/')}`
}

export function parseProcedurePath(pathname: string, prefix: string): string[] | null {
  const base = normalizePrefix(prefix)
  const path = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
  if (path === base) {
    return []
  }
  if (!path.startsWith(`${base}/`)) {
    return null
  }
  const rest = path.slice(base.length + 1)
  if (rest.length === 0) {
    return []
  }
  return rest.split('/')
}
