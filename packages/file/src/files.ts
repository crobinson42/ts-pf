import { PFError } from '@ts-pf/protocol'

const SKIP_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export type FilePlaceholder = { readonly $pf: 'file'; readonly id: string }

export function isFilePlaceholder(value: unknown): value is FilePlaceholder {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as { $pf?: unknown; id?: unknown }
  return record.$pf === 'file' && typeof record.id === 'string'
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function badRequest(message: string): PFError {
  return new PFError({ code: 'BAD_REQUEST', status: 400, message })
}

export function basename(name: string): string {
  const trimmed = name.replaceAll('\\', '/')
  const slash = trimmed.lastIndexOf('/')
  return slash === -1 ? trimmed : trimmed.slice(slash + 1)
}

export function extractFiles(
  value: unknown,
  limits: { maxFiles: number; maxFileSize: number },
): { value: unknown; files: Blob[] } {
  const files: Blob[] = []
  const seen = new WeakSet<object>()

  const walk = (node: unknown): unknown => {
    if (typeof Blob !== 'undefined' && node instanceof Blob) {
      if (files.length >= limits.maxFiles) {
        throw badRequest('Too many files')
      }
      if (node.size > limits.maxFileSize) {
        throw badRequest('File too large')
      }
      const id = String(files.length)
      files.push(node)
      return { $pf: 'file', id } satisfies FilePlaceholder
    }
    if (node === null || typeof node !== 'object') {
      return node
    }
    if (seen.has(node)) {
      throw badRequest('Circular value')
    }
    seen.add(node)
    if (Array.isArray(node)) {
      return node.map(walk)
    }
    if (!isPlainObject(node)) {
      return node
    }
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(node)) {
      if (SKIP_KEYS.has(key)) {
        continue
      }
      out[key] = walk(child)
    }
    return out
  }

  return { value: walk(value), files }
}

export function assertNoPlaceholders(value: unknown): void {
  const walk = (node: unknown): void => {
    if (isFilePlaceholder(node)) {
      throw badRequest('File placeholder in JSON body')
    }
    if (node === null || typeof node !== 'object') {
      return
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child)
      }
      return
    }
    if (!isPlainObject(node)) {
      return
    }
    for (const [key, child] of Object.entries(node)) {
      if (SKIP_KEYS.has(key)) {
        continue
      }
      walk(child)
    }
  }
  walk(value)
}

export function injectFiles(value: unknown, parts: Map<string, Blob>): unknown {
  const used = new Set<string>()

  const walk = (node: unknown): unknown => {
    if (isFilePlaceholder(node)) {
      const file = parts.get(node.id)
      if (!file) {
        throw badRequest(`Missing file part ${node.id}`)
      }
      used.add(node.id)
      return file
    }
    if (node === null || typeof node !== 'object') {
      return node
    }
    if (Array.isArray(node)) {
      return node.map(walk)
    }
    if (!isPlainObject(node)) {
      return node
    }
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(node)) {
      if (SKIP_KEYS.has(key)) {
        continue
      }
      out[key] = walk(child)
    }
    return out
  }

  const result = walk(value)
  if (used.size !== parts.size) {
    throw badRequest('Unexpected file part')
  }
  return result
}

export function fileFromPart(part: Blob): Blob {
  const name = part instanceof File ? basename(part.name) : ''
  const type = part.type
  if (name.length > 0) {
    return type ? new File([part], name, { type }) : new File([part], name)
  }
  return type ? new Blob([part], { type }) : new Blob([part])
}
