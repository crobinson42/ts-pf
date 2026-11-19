// JSON Schema reading helpers shared by print-type.ts and diff-schema.ts.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `type` as a list: a string becomes one entry, non-strings are dropped. */
export function normalizeType(type: unknown): string[] {
  if (typeof type === 'string') {
    return [type]
  }
  if (Array.isArray(type)) {
    return type.filter((item): item is string => typeof item === 'string')
  }
  return []
}

/** Resolves a local `#/…` JSON pointer against `root`. */
export function resolvePointer(root: unknown, ref: string): unknown {
  if (ref === '#') {
    return root
  }
  if (!ref.startsWith('#/')) {
    return undefined
  }
  let current: unknown = root
  for (const part of ref.slice(2).split('/').map(unescapePointer)) {
    if (!isRecord(current) && !Array.isArray(current)) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function escapePointer(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

export function unescapePointer(value: string): string {
  return value.replace(/~1/g, '/').replace(/~0/g, '~')
}
