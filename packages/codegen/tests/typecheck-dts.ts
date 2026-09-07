import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const virtualFile = join(pkgRoot, 'tests', '__virtual_contract.d.ts')

export function typecheckDts(source: string): string[] {
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
  const host = ts.createCompilerHost(options)
  const fileExists = host.fileExists.bind(host)
  const readFile = host.readFile.bind(host)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getCurrentDirectory = () => pkgRoot
  host.fileExists = (path) => path === virtualFile || fileExists(path)
  host.readFile = (path) => (path === virtualFile ? source : readFile(path))
  host.getSourceFile = (path, languageVersion, onError, shouldCreateNew) => {
    if (path === virtualFile) {
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
  const program = ts.createProgram([virtualFile], options, host)
  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    )
}
