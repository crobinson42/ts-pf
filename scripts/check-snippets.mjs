// Type-check every fenced ```ts / ```typescript block in the consumer docs
// (README.md, docs/**/*.md, packages/*/README.md, packages/*/skills/**/SKILL.md,
// examples/**/README.md) against the built dist, so a snippet a user pastes
// compiles under `strict` + NodeNext.
//
// Each block becomes its own module in a temp dir: <tmp>/<source path with
// `/` → `__`>/block-NN.ts, or the path named by a first-line `// <file>.ts`
// header (so sibling blocks' `import ... from './server.js'` resolve). A block
// without import/export gets `export {}` so blocks never share scope. A
// relative import of `./contract(.js)` that no block in that doc defines is
// satisfied by the shared fixture (the root README contract). App-owned names
// (`db`, `auth`, `Bun`, `hono`, …) come from an ambient stub file.
//
// Info-string flags: `ts no-check` skips a block (prose fragments, partial
// lines); `ts bundler` checks it under moduleResolution `bundler` instead of
// NodeNext (mvc-kit 4.9 `.d.ts` use extensionless imports; Vite/Astro apps).
// `--keep` leaves the temp dir in place and prints its path.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const keep = process.argv.includes('--keep')
const FLAGS = new Set(['no-check', 'bundler'])

if (!existsSync(join(root, 'packages/contract/dist/index.d.ts'))) {
  console.error(
    'check-snippets: packages/contract/dist is missing — run `npm run build` first',
  )
  process.exit(1)
}

// ---- sources -----------------------------------------------------------

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

function sources() {
  const files = [join(root, 'README.md')]
  files.push(...walk(join(root, 'docs')).filter((f) => f.endsWith('.md')))
  for (const pkg of readdirSync(join(root, 'packages'))) {
    const readme = join(root, 'packages', pkg, 'README.md')
    if (existsSync(readme)) files.push(readme)
    files.push(
      ...walk(join(root, 'packages', pkg, 'skills')).filter((f) =>
        f.endsWith('SKILL.md'),
      ),
    )
  }
  files.push(
    ...walk(join(root, 'examples')).filter((f) => f.endsWith('README.md')),
  )
  return files.filter((f) => existsSync(f))
}

// ---- fences -------------------------------------------------------------

// Returns { lang, flags, line (1-based line of the opening fence), body }
// for every fenced block in a markdown file.
function fences(text) {
  const lines = text.split('\n')
  const out = []
  let open = null
  lines.forEach((raw, index) => {
    const line = raw.replace(/\r$/, '')
    if (open) {
      if (/^```\s*$/.test(line)) {
        out.push({ ...open, body: open.body.join('\n') })
        open = null
      } else open.body.push(line)
      return
    }
    const match = line.match(/^```(\S*)\s*(.*)$/)
    if (!match) return
    const flags = match[2].trim() === '' ? [] : match[2].trim().split(/\s+/)
    open = { lang: match[1], flags, line: index + 1, body: [] }
  })
  return out
}

const HEADER = /^\/\/ ([\w./@[\]-]+\.tsx?)(?:\s|$)/
const RELATIVE =
  /from\s+['"](\.\.?\/[^'"]+)['"]|import\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g

// ---- temp project -------------------------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'ts-pf-check-snippets-'))
const fixturesDir = join(tmp, '_fixtures')
const failures = []
const blocks = [] // { file (abs tmp path), source (rel md path), line, mode }

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

function extract(mdPath) {
  const source = relative(root, mdPath)
  const dir = join(tmp, source.replace(/\//g, '__'))
  const written = new Set()
  let ordinal = 0
  for (const fence of fences(readFileSync(mdPath, 'utf8'))) {
    if (fence.lang !== 'ts' && fence.lang !== 'typescript') continue
    ordinal += 1
    const unknown = fence.flags.filter((flag) => !FLAGS.has(flag))
    if (unknown.length > 0) {
      failures.push(
        `${source}:${fence.line}: unknown fence flag ${unknown.join(' ')} (allowed: ${[...FLAGS].join(', ')})`,
      )
      continue
    }
    if (fence.flags.includes('no-check')) continue
    const mode = fence.flags.includes('bundler') ? 'bundler' : 'nodenext'
    let body = fence.body
    if (!/^\s*(?:import|export)\s/m.test(body)) body += '\nexport {}\n'
    const header = body.match(HEADER)
    let name = `block-${String(ordinal).padStart(2, '0')}.ts`
    if (header && !written.has(header[1])) name = header[1]
    written.add(name)
    const file = join(dir, name)
    write(file, body)
    blocks.push({ file, source, line: fence.line, mode })
  }
  // Relative imports no block in this doc defines fall back to a fixture.
  for (const block of blocks) {
    if (!block.file.startsWith(`${dir}/`)) continue
    const text = readFileSync(block.file, 'utf8')
    for (const match of text.matchAll(RELATIVE)) {
      const specifier = (match[1] ?? match[2]).replace(/\.js$/, '')
      const target = `${resolve(dirname(block.file), specifier)}.ts`
      const fixture = join(fixturesDir, `${specifier.split('/').pop()}.ts`)
      if (!existsSync(target) && existsSync(fixture)) {
        write(target, readFileSync(fixture, 'utf8'))
      }
    }
  }
}

// Shared fixture: the root README contract (planet.list / find / create).
// `Contract` mirrors what `@ts-pf/codegen` emits for the split-repo client.
const CONTRACT_FIXTURE = `import { procedure, router } from '@ts-pf/contract'
import { z } from 'zod'
import Type from 'typebox'

export const contract = router({
  planet: {
    list: procedure.output(z.array(z.object({ id: z.number(), name: z.string() }))),
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({ NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) } }),
    create: procedure
      .input(Type.Object({ name: Type.String() }))
      .output(Type.Object({ id: Type.Number(), name: Type.String() })),
  },
})

export type Contract = typeof contract
`

// Ambient stand-ins for what the docs leave to the app: its database, auth,
// runtime globals, and userland servers. Snippets name them without importing.
const STUBS = `type Planet = { id: number; name: string }
type User = { id: string }
type Db = {
  planets: {
    all(): Promise<Planet[]>
    get(id: number): Promise<Planet | undefined>
    create(input: { name: string }): Promise<Planet>
  }
}
type AppCtx = { db: Db; req?: Request; user?: User | undefined }
declare const db: Db
declare function auth(input: unknown): Promise<User | null>
declare const logger: { error(...args: unknown[]): void }
declare function readKey(call: { path: string[]; input: unknown }): string | undefined
declare const env: Record<string, string | undefined>
declare const request: Request
declare const req: Request
declare const url: URL
declare const port: MessagePort
declare const cmd: string
declare const contract: typeof import('./_fixtures/contract.js').contract
declare const planetContract: typeof contract.planet
declare const starContract: typeof contract.planet
declare const authContract: typeof contract.planet
declare const app: import('@ts-pf/server').ImplementedRouter<typeof contract>
declare const planetApp: import('@ts-pf/server').ImplementedRouter<typeof contract.planet>
declare const starApp: import('@ts-pf/server').ImplementedRouter<typeof contract.planet>
declare const authApp: import('@ts-pf/server').ImplementedRouter<typeof contract.planet>
declare const context: AppCtx
declare const handler: import('@ts-pf/server-http').FetchHandler<AppCtx>
declare const client: import('@ts-pf/contract').ContractClient<typeof contract>
declare const error: import('@ts-pf/protocol').PFError
declare const swr: import('@ts-pf/swr').SwrClient<typeof contract>
declare const UserRef: import('zod').ZodObject<{ id: import('zod').ZodString }>
declare const UserPopulated: import('zod').ZodObject<{
  id: import('zod').ZodString
  name: import('zod').ZodString
}>
declare function listUsers(): Promise<{ id: string }[]>
declare function listUsersPopulated(): Promise<{ id: string; name: string }[]>
declare const Astro: import('astro').AstroGlobal
declare function contextFromAstro(astro: import('astro').APIContext): AppCtx
declare namespace App {
  interface Locals {
    user?: User
  }
}
interface ImportMeta {
  env: { BASE_URL: string; [key: string]: string | boolean | undefined }
}
declare const Bun: {
  serve(opts: {
    fetch: (req: Request) => Response | Promise<Response>
    port?: number
  }): unknown
}
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): unknown
}
declare module '@hono/node-server' {
  export function serve(opts: {
    fetch: (req: Request) => Response | Promise<Response>
    port?: number
  }): unknown
}
declare module 'srvx' {
  export function serve(opts: {
    fetch: (req: Request) => Response | Promise<Response>
    port?: number
  }): unknown
}
declare module 'hono' {
  export type Context = { req: { raw: Request }; notFound(): Response }
  export class Hono {
    all(
      path: string,
      handler: (c: Context) => Response | Promise<Response>,
    ): this
    fetch: (req: Request) => Response | Promise<Response>
  }
}
`

// ---- compile -------------------------------------------------------------

function options(mode) {
  const bundler = mode === 'bundler'
  return {
    target: ts.ScriptTarget.ES2022,
    module: bundler ? ts.ModuleKind.ESNext : ts.ModuleKind.NodeNext,
    moduleResolution: bundler
      ? ts.ModuleResolutionKind.Bundler
      : ts.ModuleResolutionKind.NodeNext,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.asynciterable.d.ts'],
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    skipLibCheck: true,
    types: ['node'],
    typeRoots: [join(root, 'node_modules/@types')],
  }
}

function locate(diagnostic) {
  if (!diagnostic.file) return 'check-snippets'
  const file = diagnostic.file.fileName
  const { line } = diagnostic.file.getLineAndCharacterOfPosition(
    diagnostic.start ?? 0,
  )
  const block = blocks.find((entry) => entry.file === file)
  if (block) return `${block.source}:${block.line + 1 + line}`
  return `${relative(tmp, file)}:${line + 1} (fixture)`
}

function check(mode) {
  const rootNames = blocks
    .filter((block) => block.mode === mode)
    .map((block) => block.file)
  if (rootNames.length === 0) return
  const program = ts.createProgram(
    [join(tmp, '_stubs.d.ts'), ...rootNames],
    options(mode),
  )
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    if (diagnostic.file?.fileName.includes('/node_modules/')) continue
    const text = ts
      .flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      .replace(/\n/g, '\n    ')
    failures.push(`${locate(diagnostic)}: TS${diagnostic.code}: ${text}`)
  }
}

try {
  write(join(tmp, 'package.json'), '{ "type": "module" }\n')
  write(join(fixturesDir, 'contract.ts'), CONTRACT_FIXTURE)
  write(join(tmp, '_stubs.d.ts'), STUBS)
  symlinkSync(join(root, 'node_modules'), join(tmp, 'node_modules'), 'dir')
  for (const mdPath of sources()) extract(mdPath)
  check('nodenext')
  check('bundler')
} finally {
  if (keep) console.error(`check-snippets: kept ${tmp}`)
  else rmSync(tmp, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error([...new Set(failures)].sort().join('\n'))
  console.error(`\n${failures.length} failing`)
  process.exit(1)
}

console.log(`ok: ${blocks.length} snippets`)
