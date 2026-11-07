import { mkdirSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const virtualFile = join(pkgRoot, 'tests', '__virtual_contract.d.ts')

const options: ts.CompilerOptions = {
  strict: true,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  noEmit: true,
  skipLibCheck: true,
  module: ts.ModuleKind.Node16,
  moduleResolution: ts.ModuleResolutionKind.Node16,
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  types: [],
}

export function typecheckDts(source: string): string[] {
  return typecheckFiles(new Map([[virtualFile, source]]), [virtualFile])
}

/** `files` keys are paths relative to a virtual directory. `entry` is one of them. */
export function typecheckDtsDir(
  files: ReadonlyMap<string, string>,
  entry: string,
): string[] {
  const root = join(pkgRoot, 'tests', '__virtual_out')
  mkdirSync(root, { recursive: true })
  const abs = new Map<string, string>()
  for (const [rel, source] of files) {
    abs.set(join(root, rel), source)
  }
  return typecheckFiles(abs, [join(root, entry)])
}

function typecheckFiles(
  virtual: ReadonlyMap<string, string>,
  roots: string[],
): string[] {
  const host = ts.createCompilerHost(options)
  const fileExists = host.fileExists.bind(host)
  const readFile = host.readFile.bind(host)
  const getSourceFile = host.getSourceFile.bind(host)
  const realpath = host.realpath?.bind(host)
  const directoryExists = host.directoryExists?.bind(host)
  host.getCurrentDirectory = () => pkgRoot
  host.fileExists = (path) => virtual.has(path) || fileExists(path)
  host.directoryExists = (path) => {
    const prefix = path.endsWith(sep) ? path : `${path}${sep}`
    for (const file of virtual.keys()) {
      if (file === path || file.startsWith(prefix)) {
        return true
      }
    }
    return directoryExists?.(path) ?? false
  }
  host.readFile = (path) => virtual.get(path) ?? readFile(path)
  host.realpath = (path) =>
    virtual.has(path) ? path : (realpath?.(path) ?? path)
  host.getSourceFile = (path, languageVersion, onError, shouldCreateNew) => {
    const source = virtual.get(path)
    if (source !== undefined) {
      return ts.createSourceFile(
        path,
        source,
        languageVersion,
        true,
        ts.ScriptKind.TS,
      )
    }
    return getSourceFile(path, languageVersion, onError, shouldCreateNew)
  }
  const program = ts.createProgram(roots, options, host)
  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    )
}
