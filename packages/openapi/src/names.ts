const UNSAFE = /[^A-Za-z0-9._-]/g

export function sanitizeSegment(value: string): string {
  const next = value.replace(UNSAFE, '_')
  return next.length > 0 ? next : '_'
}

export function operationId(path: readonly string[]): string {
  if (path.length === 0) {
    return '_'
  }
  return path.map(sanitizeSegment).join('.')
}

export function schemaName(path: readonly string[], suffix: string): string {
  const safeSuffix = suffix.split('.').map(sanitizeSegment).join('.')
  return `${operationId(path)}.${safeSuffix}`
}

export function protocolErrorSchemaName(code: string): string {
  return `TsPf.Error.${sanitizeSegment(code)}`
}

export function operationPath(href: string | undefined, key: string): string {
  const raw = href ?? (key === '' ? '/' : `/${key}`)
  return raw.startsWith('/') ? raw : `/${raw}`
}
