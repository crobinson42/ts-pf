// Every published @ts-pf/* package must ship skills/ts-pf-<pkg>/SKILL.md
// (contract also ships ts-pf-app). "files" must include "skills".
// package.json keywords must include the shared family terms.
// ts-pf-app description must name every opt-in (non-core) package.
// skills/README.md must list every published package skill path.
// Every symbol a ts-pf-<pkg> skill lists under "## API" must be named in that
// package's README (README = narrative + install + one snippet; SKILL = Do /
// API / Pair with / Don't; the two surfaces must not drift).
// Code, skills, READMEs, and examples must not use oRPC names
// (.agents/rules.md "Public names").
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagesDir = join(root, 'packages')
const errors = []

// Core packages are the default install; everything else published under
// packages/ is an opt-in capability the hub must name. message-server /
// message-client are named by their family token "message".
const CORE = new Set([
  'contract',
  'protocol',
  'server',
  'client',
  'http',
  'server-http',
  'client-http',
])

// rules.md "Public names" → "Not" column. Word-boundary matches fail in code
// and prose; `oc.` / `os.` only in code files (prose cannot be told apart
// from ordinary words such as "macOS." or "os.").
const BANNED_WORDS = [
  'RPCHandler',
  'RPCLink',
  'mergeRouters',
  'createRouterClient',
  'createRouterUtils',
  'createSWRUtils',
  'eventIterator',
]
const BANNED = new RegExp(`\\b(?:${BANNED_WORDS.join('|')})\\b|\\bsafe\\(`, 'g')
const BANNED_CODE_ONLY = /\b(?:oc|os)\./g
const HUB_REL = 'packages/contract/skills/ts-pf-app/SKILL.md'
// Prose may forbid a name: "No `mergeRouters`", a `## Don't` /
// `## Anti-patterns` section, or the hub's Use / Not table rows.
const NEGATED = /\b(?:no|not|never)\s+`?(?:[\w*]+`?\s*\/\s*`?)*$/i
const DONT_HEADING = /^#+\s*(?:don'?t|anti-patterns?)\b/i

// npx skills experimental_sync parses front matter as YAML. An unquoted
// description that contains `Triggers:` is a nested mapping and the skill
// is skipped. Descriptions that contain `:` must be a quoted scalar.
function unquoteYamlScalar(raw) {
  const value = raw.trim()
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value)
      return typeof parsed === 'string' ? parsed : null
    } catch {
      return null
    }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'")
  }
  return null
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null
  const block = match[1]
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const rawDescription = block.match(/^description:\s*(.+)$/m)?.[1]?.trim()
  const quoted = rawDescription ? unquoteYamlScalar(rawDescription) : null
  const description = quoted ?? rawDescription
  const descriptionNeedsQuotes = Boolean(
    rawDescription && quoted === null && /:/.test(rawDescription),
  )
  return {
    name,
    description,
    hasDescription: Boolean(description),
    descriptionNeedsQuotes,
  }
}

async function checkSkill(pkgDir, skillName) {
  const rel = `${pkgDir}/skills/${skillName}/SKILL.md`
  let body
  try {
    body = await readFile(join(packagesDir, rel), 'utf8')
  } catch {
    errors.push(`missing ${rel}`)
    return
  }
  const frontmatter = parseFrontmatter(body)
  if (!frontmatter) {
    errors.push(`${rel}: missing YAML frontmatter`)
    return
  }
  if (frontmatter.name !== skillName) {
    errors.push(`${rel}: name "${frontmatter.name}" !== "${skillName}"`)
  }
  if (!frontmatter.hasDescription) {
    errors.push(`${rel}: missing description`)
  }
  if (frontmatter.descriptionNeedsQuotes) {
    errors.push(
      `${rel}: description contains ":" and must be a quoted YAML scalar (npx skills experimental_sync)`,
    )
  }
}

const entries = await readdir(packagesDir, { withFileTypes: true })
const published = []
let checked = 0

for (const entry of entries) {
  if (!entry.isDirectory()) continue
  const pkgPath = join(packagesDir, entry.name, 'package.json')
  let pkg
  try {
    pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  } catch {
    continue
  }
  if (pkg.private || !pkg.name?.startsWith('@ts-pf/')) continue
  published.push(entry.name)
  checked += 1

  const files = pkg.files ?? []
  if (!files.includes('skills')) {
    errors.push(`${entry.name}: package.json files must include "skills"`)
  }

  const requiredKeywords = [
    'ts-pf',
    'typescript',
    'rpc',
    'typesafe',
    'typed-rpc',
    'api',
    'contract-first',
  ]
  const keywords = Array.isArray(pkg.keywords) ? pkg.keywords : []
  if (keywords.length === 0) {
    errors.push(
      `${entry.name}: package.json must include a non-empty keywords array`,
    )
  } else {
    for (const keyword of requiredKeywords) {
      if (!keywords.includes(keyword)) {
        errors.push(
          `${entry.name}: package.json keywords must include "${keyword}"`,
        )
      }
    }
  }

  const skillName = `ts-pf-${entry.name}`
  await checkSkill(entry.name, skillName)
  if (entry.name === 'contract') {
    await checkSkill(entry.name, 'ts-pf-app')
  }
}

const hubRel = 'contract/skills/ts-pf-app/SKILL.md'
try {
  const hub = await readFile(join(packagesDir, hubRel), 'utf8')
  const frontmatter = parseFrontmatter(hub)
  const haystack = (frontmatter?.description ?? '').toLowerCase()
  const requiredTokens = new Set()
  for (const name of published) {
    if (CORE.has(name)) continue
    const family = name.replace(/-(?:server|client)$/, '')
    requiredTokens.add(published.includes(family) ? family : name)
  }
  for (const token of [...requiredTokens].sort()) {
    if (!haystack.includes(token)) {
      errors.push(
        `${hubRel}: description must mention "${token}" (capability catalog)`,
      )
    }
  }
} catch {
  errors.push(`missing ${hubRel}`)
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
    else out.push(path)
  }
  return out
}

async function bannedNameTargets() {
  const files = [join(root, 'README.md')]
  for (const name of published) {
    await walk(join(packagesDir, name, 'src'), files)
    await walk(join(packagesDir, name, 'skills'), files)
  }
  for (const path of await walk(join(root, 'examples'))) {
    const rel = relative(root, path)
    if (rel.split('/').includes('src') || rel.endsWith('/README.md'))
      files.push(path)
  }
  return files
}

function checkBannedNames(rel, text) {
  const prose = rel.endsWith('.md')
  let inDont = false
  text.split('\n').forEach((line, index) => {
    if (prose) {
      if (/^#/.test(line)) inDont = DONT_HEADING.test(line)
      if (inDont) return
      if (rel === HUB_REL && /^\|/.test(line)) return
    }
    const patterns = prose ? [BANNED] : [BANNED, BANNED_CODE_ONLY]
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      for (const match of line.matchAll(pattern)) {
        if (prose && NEGATED.test(line.slice(0, match.index))) continue
        errors.push(
          `${rel}:${index + 1}: banned name "${match[0]}" (see .agents/rules.md "Public names")`,
        )
      }
    }
  })
}

for (const path of await bannedNameTargets()) {
  if (!/\.(?:ts|tsx|mts|cts|js|mjs|cjs|astro|md)$/.test(path)) continue
  checkBannedNames(relative(root, path), await readFile(path, 'utf8'))
}

// Backticked exported identifiers in a skill's "## API" section (`stream()` →
// `stream`; `./stdio`, `"."`, `.call`, and option sketches are not symbols).
const IDENT = /^[A-Za-z_$][\w$]*(?:\(\))?$/
function apiSymbols(skill) {
  const section = skill.match(/^## API[ \t]*$([\s\S]*?)(?=^## |(?![\s\S]))/m)
  if (!section) return null
  const out = new Set()
  for (const [, token] of section[1].matchAll(/`([^`]+)`/g)) {
    if (IDENT.test(token)) out.add(token.replace(/\(\)$/, ''))
  }
  return out
}

for (const name of published) {
  const skillRel = `${name}/skills/ts-pf-${name}/SKILL.md`
  let skill
  let readme
  try {
    skill = await readFile(join(packagesDir, skillRel), 'utf8')
    readme = await readFile(join(packagesDir, name, 'README.md'), 'utf8')
  } catch {
    if (skill === undefined) continue // reported by checkSkill
    errors.push(`${name}: missing README.md`)
    continue
  }
  const symbols = apiSymbols(skill)
  if (!symbols) {
    errors.push(`${skillRel}: missing "## API" section`)
    continue
  }
  for (const symbol of symbols) {
    const escaped = symbol.replace(/\$/g, '\\$')
    const mentioned = new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(readme)
    if (!mentioned) {
      errors.push(
        `${name}: README.md does not mention ${symbol} (listed in SKILL API)`,
      )
    }
  }
}

const indexRel = 'skills/README.md'
const skillsDir = join(root, 'skills')
try {
  const index = await readFile(join(root, indexRel), 'utf8')
  if (!index.includes('packages/contract/skills/ts-pf-app/')) {
    errors.push(`${indexRel}: must list packages/contract/skills/ts-pf-app/`)
  }
  for (const name of published) {
    const path = `packages/${name}/skills/ts-pf-${name}/`
    if (!index.includes(path)) {
      errors.push(`${indexRel}: must list ${path}`)
    }
  }
  const stack = [skillsDir]
  while (stack.length > 0) {
    const dir = stack.pop()
    const items = await readdir(dir, { withFileTypes: true })
    for (const item of items) {
      const itemPath = join(dir, item.name)
      if (item.isDirectory()) {
        stack.push(itemPath)
      } else if (item.name === 'SKILL.md') {
        errors.push(`${indexRel}: must not contain SKILL.md (index only)`)
      }
    }
  }
} catch {
  errors.push(`missing ${indexRel}`)
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`ok: ${checked} packages`)
