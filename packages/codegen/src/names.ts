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
