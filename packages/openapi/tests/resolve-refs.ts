export function collectRefs(value: unknown, acc: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRefs(item, acc)
    }
    return acc
  }
  if (typeof value !== 'object' || value === null) {
    return acc
  }
  const record = value as Record<string, unknown>
  if (typeof record.$ref === 'string') {
    acc.push(record.$ref)
  }
  for (const child of Object.values(record)) {
    collectRefs(child, acc)
  }
  return acc
}

export function resolvePointer(root: unknown, ref: string): unknown {
  if (ref === '#') {
    return root
  }
  if (!ref.startsWith('#/')) {
    return undefined
  }
  let current: unknown = root
  for (const part of ref.slice(2).split('/').map(unescapePointer)) {
    if (typeof current !== 'object' || current === null) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function unresolvedRefs(root: unknown): string[] {
  return collectRefs(root).filter((ref) => {
    if (ref.startsWith('#/') || ref === '#') {
      return resolvePointer(root, ref) === undefined
    }
    return false
  })
}

function unescapePointer(value: string): string {
  return value.replace(/~1/g, '/').replace(/~0/g, '~')
}
