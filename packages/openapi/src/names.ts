const UNSAFE = /[^A-Za-z0-9._-]/g

function sanitizeSegment(value: string): string {
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

/** A declared error code whose data shape is the same on every procedure. */
export function sharedErrorSchemaName(code: string): string {
  return `Error.${sanitizeSegment(code)}`
}

/** A schema `.meta({ id })` hoisted out of `$defs`. */
export function idSchemaName(id: string): string {
  return sanitizeSegment(id)
}

export function operationPath(href: string | undefined, key: string): string {
  const raw = href ?? (key === '' ? '/' : `/${key}`)
  return raw.startsWith('/') ? raw : `/${raw}`
}

/**
 * `verifyCode` → `VerifyCode`, `NOT_FOUND` → `NotFound`, `get-user` →
 * `GetUser`. All-caps words are capitalized; other words keep their case.
 */
export function pascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) =>
      /^[A-Z0-9]+$/.test(word)
        ? `${word.charAt(0)}${word.slice(1).toLowerCase()}`
        : `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
    )
    .join('')
}
