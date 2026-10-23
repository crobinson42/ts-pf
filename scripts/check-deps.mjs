// Enforce the @ts-pf/* dependency DAG from .agents/rules.md ("Packages").
// PROD, DEV, and NEVER below mirror that section. They must change in the
// same PR as rules.md, never on their own.
//
// Checks, per packages/*:
// - dependencies / peerDependencies ⊆ allowed prod set
// - devDependencies ⊆ allowed prod ∪ allowed dev set
// - src/**/*.ts (non-test) imports are allowed in prod and declared in
//   "dependencies" (not only devDependencies)
// - tests/**/*.ts (and *.test.ts under src) imports are allowed in prod or
//   dev and declared in dependencies or devDependencies
// - the declared prod graph has no cycle
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagesDir = join(root, 'packages')
const errors = []

// Direct prod edges (rules.md "Packages" diagram and bullets). A package may
// also declare and import anything reachable through these edges (e.g. astro
// → contract via server): that adds no edge to the DAG shape. Anything else
// is a violation.
const PROD = {
  contract: [],
  protocol: [],
  server: ['contract', 'protocol'],
  client: ['contract', 'protocol'],
  http: ['protocol'],
  'server-http': ['server', 'http', 'protocol'],
  'client-http': ['client', 'http', 'protocol'],
  file: ['http', 'protocol'],
  stream: ['http', 'protocol', 'contract'],
  sse: ['stream', 'http', 'protocol'],
  docs: ['contract', 'protocol', 'http'],
  openapi: ['docs'],
  codegen: ['docs'],
  swr: ['contract'],
  'mvc-kit': ['contract'],
  astro: ['server-http', 'server', 'client-http', 'client'],
  message: ['protocol'],
  'message-server': ['message', 'server', 'protocol'],
  'message-client': ['message', 'client', 'protocol'],
}

// Dev-only exceptions: devDependencies and tests/ only, never prod.
// rules.md names two of them explicitly (message-client → message-server for
// e2e; client tests may use server). The rest are the in-process / Fetch
// round-trip test harnesses of opt-in packages; each "(prod)" qualifier in
// rules.md leaves them open and nothing there forbids them. Adding a new
// entry here is a rules.md change.
const DEV = {
  'client-http': ['server', 'server-http'],
  'message-client': ['message-server', 'server', 'stream'],
  file: ['server', 'server-http', 'client', 'client-http'],
  stream: ['server', 'server-http', 'client', 'client-http'],
  sse: ['server', 'server-http', 'client', 'client-http'],
  docs: ['stream'],
  openapi: ['stream'],
  codegen: ['client', 'stream'],
  swr: ['client', 'server', 'stream'],
  'mvc-kit': ['client', 'server', 'protocol'],
}

// Named "never" rules, so the message says which rule was broken. `prod`
// covers dependencies / peerDependencies / src imports; `any` also covers
// devDependencies and tests. First match wins.
const NEVER = [
  {
    from: 'contract',
    to: 'protocol',
    scope: 'any',
    why: 'contract and protocol are siblings',
  },
  {
    from: 'protocol',
    to: 'contract',
    scope: 'any',
    why: 'contract and protocol are siblings',
  },
  { from: 'contract', to: 'http', scope: 'any', why: 'no HTTP in contract' },
  {
    from: 'server',
    to: 'client',
    scope: 'any',
    why: 'server never depends on client',
  },
  {
    from: 'client',
    to: 'server',
    scope: 'prod',
    why: 'client never depends on server (tests may, as a devDependency)',
  },
  {
    from: 'server-http',
    to: 'client-http',
    scope: 'any',
    why: 'server-http never depends on client-http',
  },
  {
    from: 'client-http',
    to: 'server-http',
    scope: 'prod',
    why: 'client-http never depends on server-http (prod)',
  },
  {
    from: 'message-server',
    to: 'client',
    scope: 'any',
    why: 'message-server never depends on client (prod or dev)',
  },
  {
    from: 'message-client',
    to: 'server',
    scope: 'prod',
    why: 'message-client never depends on server (prod)',
  },
  {
    from: 'server',
    to: 'message-server',
    scope: 'prod',
    why: 'do not import message-server from server',
  },
  {
    from: 'client',
    to: 'message-client',
    scope: 'prod',
    why: 'do not import message-client from client (prod)',
  },
  ...['contract', 'server', 'client'].flatMap((from) =>
    ['http', 'file', 'stream', 'sse'].map((to) => ({
      from,
      to,
      scope: 'prod',
      why: `${to} is not imported by contract/server/client (prod)`,
    })),
  ),
]

const SCOPE = '@ts-pf/'
const PROD_KINDS = ['dependencies', 'peerDependencies', 'optionalDependencies']
const SOURCE_EXT = /\.(?:ts|tsx|mts|cts)$/
const DECLARATION_EXT = /\.d\.(?:ts|mts|cts)$/
const TEST_FILE = /\.(?:test|spec|test-d)\.(?:ts|tsx|mts|cts)$/

// Real import / export-from statements only (line start, leading whitespace
// allowed), so string literals inside generated-code templates such as
// packages/codegen/src/emit.ts do not count. Braces may span lines.
const STATIC_IMPORT =
  /^[ \t]*(?:import|export)\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\}|[\w$]+(?:\s*,\s*(?:\*\s+as\s+[\w$]+|\{[^}]*\}))?)\s*from\s*['"]([^'"]+)['"]/gm
const SIDE_EFFECT_IMPORT = /^[ \t]*import\s+['"]([^'"]+)['"]/gm
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

function packageOf(specifier) {
  if (!specifier.startsWith(SCOPE)) return null
  return specifier.slice(SCOPE.length).split('/')[0]
}

function closure(graph, start) {
  const seen = new Set()
  const stack = [...(graph[start] ?? [])]
  while (stack.length > 0) {
    const next = stack.pop()
    if (seen.has(next)) continue
    seen.add(next)
    stack.push(...(graph[next] ?? []))
  }
  return seen
}

function neverReason(from, to, prod) {
  const rule = NEVER.find(
    (entry) =>
      entry.from === from && entry.to === to && (prod || entry.scope === 'any'),
  )
  return rule ? `: ${rule.why}` : ''
}

function violation(pkg, kind, specifier, file, line, reason) {
  errors.push(
    `check-deps: ${pkg} ${kind} ${specifier} (${file}:${line}) ${reason}`,
  )
}

function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1
  return line
}

function lineOfKey(text, section, key) {
  const sectionIndex = text.indexOf(`"${section}"`)
  const keyIndex = text.indexOf(`"${key}"`, Math.max(0, sectionIndex))
  return keyIndex < 0 ? 1 : lineOf(text, keyIndex)
}

function* imports(text) {
  for (const pattern of [STATIC_IMPORT, SIDE_EFFECT_IMPORT, DYNAMIC_IMPORT]) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1]
      const offset = match.index + match[0].lastIndexOf(specifier)
      yield { specifier, line: lineOf(text, offset) }
    }
  }
}

async function walk(dir, out = []) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await walk(path, out)
    else if (SOURCE_EXT.test(entry.name) && !DECLARATION_EXT.test(entry.name))
      out.push(path)
  }
  return out
}

const packages = new Map()
for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const pkgPath = join(packagesDir, entry.name, 'package.json')
  let text
  try {
    text = await readFile(pkgPath, 'utf8')
  } catch {
    continue
  }
  const pkg = JSON.parse(text)
  if (!pkg.name?.startsWith(SCOPE)) continue
  const short = pkg.name.slice(SCOPE.length)
  if (short !== entry.name) {
    errors.push(
      `check-deps: packages/${entry.name} is named ${pkg.name} (expected @ts-pf/${entry.name})`,
    )
  }
  const section = (kind) =>
    Object.keys(pkg[kind] ?? {})
      .filter((name) => name.startsWith(SCOPE))
      .map((name) => ({
        name,
        short: name.slice(SCOPE.length),
        line: lineOfKey(text, kind, name),
      }))
  packages.set(entry.name, {
    dir: entry.name,
    file: `packages/${entry.name}/package.json`,
    prod: PROD_KINDS.flatMap((kind) =>
      section(kind).map((dep) => ({ ...dep, kind })),
    ),
    dev: section('devDependencies').map((dep) => ({
      ...dep,
      kind: 'devDependencies',
    })),
  })
}

for (const name of Object.keys(PROD)) {
  if (!packages.has(name))
    errors.push(
      `check-deps: PROD lists ${name} but packages/${name} does not exist`,
    )
}
for (const name of Object.keys(DEV)) {
  if (!PROD[name])
    errors.push(`check-deps: DEV lists ${name} but PROD does not`)
}
for (const name of packages.keys()) {
  if (!PROD[name]) {
    errors.push(
      `check-deps: packages/${name} is not in the rules.md DAG (add it to PROD in scripts/check-deps.mjs and to .agents/rules.md)`,
    )
  }
}

for (const info of packages.values()) {
  if (!PROD[info.dir]) continue
  const allowedProd = closure(PROD, info.dir)
  const allowedDev = new Set([
    ...allowedProd,
    ...closure({ ...PROD, [info.dir]: DEV[info.dir] ?? [] }, info.dir),
  ])
  const declaredProd = new Set(info.prod.map((dep) => dep.short))
  const declaredDev = new Set(info.dev.map((dep) => dep.short))

  for (const dep of info.prod) {
    if (dep.short === info.dir) {
      violation(
        info.dir,
        dep.kind,
        dep.name,
        info.file,
        dep.line,
        'depends on itself',
      )
    } else if (!allowedProd.has(dep.short)) {
      violation(
        info.dir,
        dep.kind,
        dep.name,
        info.file,
        dep.line,
        `not allowed by rules.md DAG${neverReason(info.dir, dep.short, true)}`,
      )
    }
  }
  for (const dep of info.dev) {
    if (!allowedDev.has(dep.short) || dep.short === info.dir) {
      violation(
        info.dir,
        dep.kind,
        dep.name,
        info.file,
        dep.line,
        `not allowed by rules.md DAG${neverReason(info.dir, dep.short, false)}`,
      )
    }
  }

  const srcFiles = await walk(join(packagesDir, info.dir, 'src'))
  const testFiles = await walk(join(packagesDir, info.dir, 'tests'))
  const sources = []
  for (const file of srcFiles) {
    sources.push({ file, test: TEST_FILE.test(file) })
  }
  for (const file of testFiles) sources.push({ file, test: true })

  for (const { file, test } of sources) {
    const text = await readFile(file, 'utf8')
    const rel = relative(root, file)
    for (const { specifier, line } of imports(text)) {
      const short = packageOf(specifier)
      if (!short || short === info.dir) continue
      const kind = test ? 'test-import' : 'import'
      if (test) {
        if (!allowedDev.has(short)) {
          violation(
            info.dir,
            kind,
            specifier,
            rel,
            line,
            `not allowed by rules.md DAG${neverReason(info.dir, short, false)}`,
          )
        } else if (!declaredProd.has(short) && !declaredDev.has(short)) {
          violation(
            info.dir,
            kind,
            specifier,
            rel,
            line,
            `not declared in ${info.file} dependencies or devDependencies`,
          )
        }
        continue
      }
      if (!allowedProd.has(short)) {
        violation(
          info.dir,
          kind,
          specifier,
          rel,
          line,
          `not allowed by rules.md DAG${neverReason(info.dir, short, true)}`,
        )
      } else if (!declaredProd.has(short)) {
        const where = declaredDev.has(short) ? 'only in devDependencies' : 'not'
        violation(
          info.dir,
          kind,
          specifier,
          rel,
          line,
          `${where} declared in ${info.file} dependencies`,
        )
      }
    }
  }
}

// Cycle detection on the declared prod graph.
{
  const graph = {}
  for (const info of packages.values())
    graph[info.dir] = info.prod.map((dep) => dep.short)
  const state = new Map()
  const path = []
  const visit = (node) => {
    const mark = state.get(node)
    if (mark === 'done') return
    if (mark === 'active') {
      const cycle = [...path.slice(path.indexOf(node)), node]
      errors.push(
        `check-deps: cycle in declared dependencies: ${cycle.map((n) => `@ts-pf/${n}`).join(' -> ')}`,
      )
      return
    }
    state.set(node, 'active')
    path.push(node)
    for (const next of graph[node] ?? []) visit(next)
    path.pop()
    state.set(node, 'done')
  }
  for (const node of Object.keys(graph)) visit(node)
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`ok: ${packages.size} packages`)
