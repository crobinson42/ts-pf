import type { CatalogProcedure, ProcedureCatalog } from '@ts-pf/docs'
import {
  assertSupportedCatalog,
  catalogBanner,
  collectProcedure,
  type EmitOptions,
  generatedHeader,
} from './emit.js'
import { jsDocLines } from './jsdoc.js'
import { aliasName, fileStem, quoteKey } from './names.js'
import { PHANTOM_EXPORT_SOURCE } from './phantom.js'
import { buildTree, type TreeNode } from './tree.js'

export type EmitFile = {
  /** Posix path relative to the output directory. */
  path: string
  contents: string
}

const ENTRY = 'contract.d.ts'
const PHANTOM = '_phantom.d.ts'

export function emitFiles(
  catalog: ProcedureCatalog,
  options: EmitOptions = {},
): EmitFile[] {
  assertSupportedCatalog(catalog)
  const name = options.name ?? 'Contract'
  const failOnUnavailable = options.failOnUnavailable ?? false
  const banner = options.banner ?? true
  const tree = buildTree(catalog.procedures)

  const generated: EmitFile[] = []
  const seen = new Set<string>()
  let phantom = false

  const add = (file: EmitFile): void => {
    if (seen.has(file.path)) {
      throw new Error(`Duplicate generated path: ${file.path}`)
    }
    seen.add(file.path)
    generated.push(file)
  }

  const walk = (
    path: readonly string[],
    children: Map<string, TreeNode>,
  ): void => {
    if (path.length > 0) {
      add({
        path: `${fileStem(path)}.d.ts`,
        contents: printGroupFile(path, children),
      })
    }
    for (const [key, node] of children) {
      const child = [...path, key]
      if (node.kind === 'proc') {
        const printed = printProcedureFile(node.proc, failOnUnavailable)
        if (printed.usesPhantom) {
          phantom = true
        }
        add({
          path: `${fileStem(child)}.d.ts`,
          contents: printed.contents,
        })
      } else {
        walk(child, node.children)
      }
    }
  }

  walk([], tree)

  const header = banner
    ? catalogBanner(catalog)
    : generatedHeader(['role: entry'])
  const files: EmitFile[] = [
    { path: ENTRY, contents: printEntry(name, tree, header) },
  ]
  if (phantom) {
    files.push({ path: PHANTOM, contents: printPhantom() })
  }
  generated.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  files.push(...generated)
  return files
}

function printEntry(
  name: string,
  tree: Map<string, TreeNode>,
  header: string,
): string {
  return [
    header,
    '',
    `export type ${name} = ${printMembers([], tree)}`,
    '',
  ].join('\n')
}

function printGroupFile(
  path: readonly string[],
  children: Map<string, TreeNode>,
): string {
  const typeName = aliasName(path, '')
  const parent =
    path.length === 1
      ? './contract.d.ts'
      : `./${fileStem(path.slice(0, -1))}.d.ts`
  return [
    generatedHeader([
      'role: group',
      `path: ${path.join('.')}`,
      `exports: ${typeName}`,
      `parent: ${parent}`,
    ]),
    '',
    `export type ${typeName} = ${printMembers(path, children)}`,
    '',
  ].join('\n')
}

function printMembers(
  path: readonly string[],
  children: Map<string, TreeNode>,
): string {
  const lines = ['{']
  for (const [key, node] of children) {
    const child = [...path, key]
    if (node.kind === 'proc') {
      for (const line of jsDocLines(node.proc.docs)) {
        lines.push(`  ${line}`)
      }
    }
    const stem = fileStem(child)
    const typeName = aliasName(child, '')
    lines.push(`  ${quoteKey(key)}: import('./${stem}.js').${typeName}`)
  }
  lines.push('}')
  return lines.join('\n')
}

function printProcedureFile(
  proc: CatalogProcedure,
  failOnUnavailable: boolean,
): { contents: string; usesPhantom: boolean } {
  const aliases: Array<{ name: string; ts: string }> = []
  const slots = collectProcedure(proc, aliases, failOnUnavailable)
  const usesPhantom = proc.errors.some((err) => err.data !== undefined)
  const name = aliasName(proc.path, '')
  const exports = [`${name}`, `${name}Input`, `${name}Output`]
  if (slots.errors !== undefined) {
    exports.push(`${name}Errors`)
  }
  const header = [
    'role: procedure',
    `path: ${proc.path.join('.')}`,
    `call: client.${proc.path.join('.')}(input)`,
    `exports: ${exports.join(', ')}`,
  ]
  if (proc.path.length > 1) {
    header.push(`group: ./${fileStem(proc.path.slice(0, -1))}.d.ts`)
  }
  const summary = headerSummary(proc.docs)
  if (summary !== undefined) {
    header.push(`summary: ${summary}`)
  }
  const lines: string[] = [
    generatedHeader(header),
    '',
    "import type { ContractProcedure } from '@ts-pf/contract'",
  ]
  if (usesPhantom) {
    lines.push("import type { Phantom } from './_phantom.js'")
  }
  lines.push('')
  for (const alias of aliases) {
    lines.push(`type ${alias.name} = ${alias.ts}`)
    lines.push('')
  }
  lines.push(`export type ${name}Input = ${slots.input}`)
  lines.push(`export type ${name}Output = ${slots.output}`)
  if (slots.errors !== undefined) {
    lines.push(`export type ${name}Errors = ${slots.errors}`)
  }
  const docs = jsDocLines(proc.docs)
  if (docs.length > 0) {
    lines.push('')
    lines.push(...docs)
  }
  const args =
    slots.errors === undefined
      ? [`${name}Input`, `${name}Output`]
      : [`${name}Input`, `${name}Output`, `${name}Errors`]
  lines.push(
    `export type ${name} = ContractProcedure<\n${args.map((arg) => `  ${arg}`).join(',\n')}\n>`,
  )
  lines.push('')
  return { contents: lines.join('\n'), usesPhantom }
}

function printPhantom(): string {
  return [
    generatedHeader([
      'role: phantom',
      'Internal. Not a procedure. Do not import from app code.',
    ]),
    '',
    PHANTOM_EXPORT_SOURCE,
    '',
  ].join('\n')
}

const SUMMARY_LIMIT = 120

function headerSummary(docs: CatalogProcedure['docs']): string | undefined {
  if (docs == null || typeof docs !== 'object') {
    return undefined
  }
  const summary = oneLine(docs.summary) ?? oneLine(docs.description)
  if (summary === undefined) {
    return undefined
  }
  if (summary.length <= SUMMARY_LIMIT) {
    return summary
  }
  return `${summary.slice(0, SUMMARY_LIMIT - 3)}...`
}

function oneLine(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const collapsed = value.replace(/\s+/g, ' ').trim()
  return collapsed.length > 0 ? collapsed : undefined
}
