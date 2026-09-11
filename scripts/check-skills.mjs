// Every published @ts-pf/* package must ship skills/ts-pf-<pkg>/SKILL.md
// (contract also ships ts-pf-app). "files" must include "skills".
// package.json keywords must include the shared family terms.
// ts-pf-app description must keep opt-in discovery tokens.
// skills/README.md must list every published package skill path.
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagesDir = join(root, 'packages')
const errors = []

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null
  const block = match[1]
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim()
  return { name, description, hasDescription: Boolean(description) }
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
    errors.push(`${entry.name}: package.json must include a non-empty keywords array`)
  } else {
    for (const keyword of requiredKeywords) {
      if (!keywords.includes(keyword)) {
        errors.push(`${entry.name}: package.json keywords must include "${keyword}"`)
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
  const requiredTokens = [
    'file',
    'stream',
    'sse',
    'message',
    'docs',
    'openapi',
    'codegen',
    'swr',
    'mvc-kit',
  ]
  for (const token of requiredTokens) {
    if (!haystack.includes(token)) {
      errors.push(`${hubRel}: description must mention "${token}" (capability catalog)`)
    }
  }
} catch {
  errors.push(`missing ${hubRel}`)
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
