// Every published @ts-pf/* package must ship skills/ts-pf-<pkg>/SKILL.md
// (contract also ships ts-pf-app). "files" must include "skills".
// package.json keywords must include the shared family terms.
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
  const hasDescription = /^description:\s*\S/m.test(block)
  return { name, hasDescription }
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

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`ok: ${checked} packages`)
