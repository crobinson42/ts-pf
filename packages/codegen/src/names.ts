const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

const RESERVED = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'implements',
  'interface',
  'let',
  'package',
  'private',
  'protected',
  'public',
  'static',
  'yield',
  'await',
])

export function isIdent(value: string): boolean {
  return IDENT.test(value) && !RESERVED.has(value)
}

export function quoteKey(value: string): string {
  return isIdent(value) ? value : quoteString(value)
}

export function quoteString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

export function pascalCase(segment: string): string {
  const parts = segment.split(/[^A-Za-z0-9]+/).filter((part) => part.length > 0)
  const joined = parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  if (joined.length === 0) {
    return '_'
  }
  return /^[0-9]/.test(joined) ? `_${joined}` : joined
}

export function aliasName(path: readonly string[], suffix: string): string {
  const stem = path.map(pascalCase).join('')
  return `${stem.length > 0 ? stem : '_'}${suffix}`
}

const MAX_RELATIVE_PATH = 200

// Windows device names, matched against the whole filename without `.d.ts`.
const RESERVED_STEM = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/**
 * Posix filename stem for a procedure or namespace path. ASCII `[A-Za-z0-9_]`
 * is kept; every other UTF-8 byte is `%XX`. `.` is encoded, so the join dot
 * cannot collide with a segment. `~` is outside that set and marks the few
 * stems that would otherwise take `contract.d.ts`, `_phantom.d.ts`, or a
 * Windows device name.
 */
export function fileStem(path: readonly string[]): string {
  if (path.length === 0) {
    throw new Error(
      'Empty procedure path. Wrap the contract in router({ ... }).',
    )
  }
  const encoded: string[] = []
  for (const segment of path) {
    if (segment.length === 0) {
      throw new Error(`Empty path segment in ${path.join('/')}`)
    }
    encoded.push(encodeSegment(segment))
  }
  let stem = encoded.join('.')
  if (stem === 'contract' || stem === '_phantom' || RESERVED_STEM.test(stem)) {
    stem = `${stem}~`
  }
  const relative = `${stem}.d.ts`
  if (relative.length > MAX_RELATIVE_PATH) {
    throw new Error(
      `Generated path is too long (${String(relative.length)} characters) for ${path.join('/')}`,
    )
  }
  return stem
}

function encodeSegment(segment: string): string {
  let out = ''
  for (const byte of Buffer.from(segment, 'utf8')) {
    const char = String.fromCharCode(byte)
    if (/[A-Za-z0-9_]/.test(char)) {
      out += char
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
    }
  }
  return out
}
