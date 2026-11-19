import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE_BASE = '/ts-pf'
const GITHUB = 'https://github.com/crobinson42/ts-pf'
const GITHUB_BLOB = `${GITHUB}/blob/main/`
const GITHUB_TREE = `${GITHUB}/tree/main/`

const siteRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const repoRoot = path.resolve(siteRoot, '..')
const contentRoot = path.join(siteRoot, 'src/content/docs')
const check = process.argv.includes('--check')

const PACKAGE_ORDER = [
  'contract',
  'protocol',
  'server',
  'client',
  'http',
  'server-http',
  'client-http',
  'file',
  'stream',
  'sse',
  'docs',
  'openapi',
  'codegen',
  'message',
  'message-server',
  'message-client',
  'swr',
  'mvc-kit',
  'astro',
  'mcp',
]

const GUIDE_ORDER = [
  'concepts.md',
  'errors.md',
  'evolution.md',
  'testing.md',
  'coming-from-trpc-orpc.md',
]

const generatedDirs = [
  path.join(contentRoot, 'packages'),
  path.join(contentRoot, 'guides'),
]

const generatedFiles = new Map()

const packages = await loadPackages()
const guides = await loadGuides()
const rootReadme = await readRepoFile('README.md')
const tutorial = await readRepoFile('docs/tutorial.md')
const protocol = await readRepoFile('packages/protocol/PROTOCOL.md')

generatedFiles.set(
  'getting-started.md',
  pageFromMarkdown({
    title: 'Getting started',
    description:
      'Install ts-pf and the Fetch happy path. This page is the root README.',
    source: 'README.md',
    fromDir: '',
    markdown: rootReadme,
    comment: 'Generated from README.md. Do not edit.',
  }),
)
generatedFiles.set(
  'tutorial.md',
  pageFromMarkdown({
    title: heading(tutorial) ?? 'Tutorial',
    description: firstParagraph(tutorial),
    source: 'docs/tutorial.md',
    fromDir: 'docs',
    markdown: tutorial,
    comment: 'Generated from docs/tutorial.md. Do not edit.',
  }),
)
generatedFiles.set(
  'protocol.md',
  pageFromMarkdown({
    title: 'Protocol',
    description: firstParagraph(protocol),
    source: 'packages/protocol/PROTOCOL.md',
    fromDir: 'packages/protocol',
    markdown: protocol,
    comment: 'Generated from packages/protocol/PROTOCOL.md. Do not edit.',
  }),
)
generatedFiles.set('packages/index.md', packagesIndex(packages))
generatedFiles.set('guides/index.md', guidesIndex(guides))

for (const [i, pkg] of packages.entries()) {
  generatedFiles.set(
    `packages/${pkg.dirName}.md`,
    pageFromMarkdown({
      title: pkg.name,
      description: pkg.description,
      source: `packages/${pkg.dirName}/README.md`,
      fromDir: `packages/${pkg.dirName}`,
      markdown: pkg.readme,
      comment: `Generated from packages/${pkg.dirName}/README.md. Do not edit.`,
      order: i + 1,
    }),
  )
}

for (const guide of guides) {
  generatedFiles.set(
    `guides/${guide.slug}.md`,
    pageFromMarkdown({
      title: heading(guide.markdown) ?? guide.slug,
      description: firstParagraph(guide.markdown),
      source: `docs/${guide.file}`,
      fromDir: 'docs',
      markdown: guide.markdown,
      comment: `Generated from docs/${guide.file}. Do not edit.`,
      order: guide.order,
    }),
  )
}

if (check) {
  const mismatches = await diff(generatedFiles)
  if (mismatches.length > 0) {
    console.error(
      'Docs site pages are out of date. Run `node site/scripts/sync-docs.mjs`.',
    )
    for (const file of mismatches) console.error(`  ${file}`)
    process.exit(1)
  }
} else {
  await writePages(generatedFiles)
}

async function readRepoFile(rel) {
  return readFile(path.join(repoRoot, rel), 'utf8')
}

async function loadPackages() {
  const packagesRoot = path.join(repoRoot, 'packages')
  const entries = await readdir(packagesRoot, { withFileTypes: true })
  const loaded = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(packagesRoot, entry.name)
    const manifestPath = path.join(dir, 'package.json')
    let manifest
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch (error) {
      if (error && error.code === 'ENOENT') continue
      throw error
    }
    if (manifest.private === true) continue
    if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
      throw new Error(`${manifestPath} is missing a name`)
    }
    const readmePath = path.join(dir, 'README.md')
    let readme
    try {
      readme = await readFile(readmePath, 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        throw new Error(
          `Published package ${manifest.name} is missing ${readmePath}`,
        )
      }
      throw error
    }
    loaded.push({
      dirName: entry.name,
      name: manifest.name,
      description:
        typeof manifest.description === 'string' ? manifest.description : '',
      readme,
    })
  }
  loaded.sort((a, b) => {
    const ai = PACKAGE_ORDER.indexOf(a.dirName)
    const bi = PACKAGE_ORDER.indexOf(b.dirName)
    const ao = ai === -1 ? PACKAGE_ORDER.length : ai
    const bo = bi === -1 ? PACKAGE_ORDER.length : bi
    if (ao !== bo) return ao - bo
    return a.name.localeCompare(b.name)
  })
  return loaded
}

async function loadGuides() {
  const docsDir = path.join(repoRoot, 'docs')
  const skip = new Set(['README.md', 'tutorial.md'])
  const names = (await readdir(docsDir)).filter(
    (name) => name.endsWith('.md') && !skip.has(name),
  )
  const loaded = []
  for (const file of names) {
    const markdown = await readFile(path.join(docsDir, file), 'utf8')
    const known = GUIDE_ORDER.indexOf(file)
    loaded.push({
      file,
      slug: file.replace(/\.md$/, ''),
      markdown,
      order: known === -1 ? GUIDE_ORDER.length + 1 : known + 1,
    })
  }
  loaded.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
  return loaded
}

function packagesIndex(listed) {
  const items = listed
    .map((pkg) => `- [${pkg.name}](${SITE_BASE}/packages/${pkg.dirName}/)`)
    .join('\n')
  return `${frontmatter({
    title: 'Packages',
    description: 'Every published @ts-pf/* README.',
    label: 'Overview',
    order: 0,
  })}<!-- Generated from published package READMEs. Do not edit. -->

These pages are copied from each package README when the site builds. The procedure catalog library is [@ts-pf/docs](${SITE_BASE}/packages/docs/), not this site.

${items}
`
}

function guidesIndex(listed) {
  const items = listed
    .map((guide) => {
      const title = heading(guide.markdown) ?? guide.slug
      return `- [${title}](${SITE_BASE}/guides/${guide.slug}/)`
    })
    .join('\n')
  return `${frontmatter({
    title: 'Guides',
    description:
      'Concepts, errors, testing, and migration. Copied from docs/*.md.',
    label: 'Overview',
    order: 0,
  })}<!-- Generated from docs/*.md. Do not edit. -->

Human-oriented guides that sit between [Getting started](${SITE_BASE}/getting-started/) and the [Protocol](${SITE_BASE}/protocol/). Contributor docs stay on GitHub.

${items}
`
}

function pageFromMarkdown({
  title,
  description,
  fromDir,
  markdown,
  comment,
  order,
}) {
  return `${frontmatter({ title, description, order })}<!-- ${comment} -->

${rewriteMarkdown(pageBody(markdown), fromDir)}`
}

function frontmatter({ title, description, label, order }) {
  const sidebar =
    order === undefined && label === undefined
      ? ''
      : `sidebar:\n${
          label === undefined ? '' : `  label: ${JSON.stringify(label)}\n`
        }${order === undefined ? '' : `  order: ${order}\n`}`
  return `---
title: ${JSON.stringify(title)}
description: ${JSON.stringify(description)}
${sidebar}---

`
}

function pageBody(markdown) {
  const lines = markdown
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
  if (lines[0]?.startsWith('# ')) {
    lines.shift()
    if (lines[0] === '') lines.shift()
  }
  return `${lines.join('\n').trimEnd()}\n`
}

function heading(markdown) {
  const match = markdown.replace(/^\uFEFF/, '').match(/^# (.+)$/m)
  return match?.[1]?.trim()
}

function firstParagraph(markdown) {
  const body = pageBody(markdown)
  const block = body.split(/\n\n+/)[0] ?? ''
  return block
    .replace(/\s+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

function rewriteMarkdown(text, fromDir) {
  return text
    .split(/(```[\s\S]*?```)/g)
    .map((part, index) => {
      if (index % 2 === 1) return part
      return part.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_all, label, href) => {
        const next = rewriteHref(href.trim(), fromDir)
        return `[${label}](${next})`
      })
    })
    .join('')
}

function rewriteHref(href, fromDir) {
  if (
    href.startsWith('#') ||
    href.startsWith('mailto:') ||
    href.startsWith('http://') ||
    href.startsWith('https://')
  ) {
    return rewriteRemote(href)
  }
  const hashIndex = href.indexOf('#')
  const rawPath = hashIndex === -1 ? href : href.slice(0, hashIndex)
  const hash = hashIndex === -1 ? '' : href.slice(hashIndex)
  if (rawPath === '') return href
  const repoPath = path.posix
    .normalize(path.posix.join(fromDir === '' ? '.' : fromDir, rawPath))
    .replace(/^\.\//, '')
    .replace(/\/$/, '')
  return mapRepoPath(repoPath) + hash
}

function rewriteRemote(href) {
  const repo = href.match(
    /^https:\/\/github\.com\/crobinson42\/ts-pf\/?(?:#(.*))?$/,
  )
  if (repo) {
    const hash = repo[1]
    if (!hash) return href
    if (hash.toLowerCase() === 'readme') {
      return `${SITE_BASE}/getting-started/`
    }
    return `${SITE_BASE}/getting-started/#${hash}`
  }
  const blob = href.match(
    /^https:\/\/github\.com\/crobinson42\/ts-pf\/(?:blob|tree)\/main\/(.+)$/,
  )
  if (blob) {
    const [pathPart, hash] = splitHash(blob[1])
    return mapRepoPath(pathPart.replace(/\/$/, '')) + (hash ? `#${hash}` : '')
  }
  return href
}

function splitHash(value) {
  const index = value.indexOf('#')
  if (index === -1) return [value, '']
  return [value.slice(0, index), value.slice(index + 1)]
}

function mapRepoPath(repoPath) {
  const site = sitePath(repoPath)
  if (site) return site
  return github(repoPath)
}

function sitePath(repoPath) {
  if (repoPath === '' || repoPath === '.' || repoPath === 'README.md') {
    return `${SITE_BASE}/getting-started/`
  }
  if (repoPath === 'packages/protocol/PROTOCOL.md') {
    return `${SITE_BASE}/protocol/`
  }
  if (repoPath === 'docs/tutorial.md') return `${SITE_BASE}/tutorial/`
  if (repoPath === 'docs/README.md') return `${SITE_BASE}/guides/`
  const guide = repoPath.match(/^docs\/([^/]+)\.md$/)
  if (guide) return `${SITE_BASE}/guides/${guide[1]}/`
  const pkgReadme = repoPath.match(/^packages\/([^/]+)(?:\/README\.md)?$/)
  if (pkgReadme) return `${SITE_BASE}/packages/${pkgReadme[1]}/`
  return null
}

function github(repoPath) {
  const leaf = repoPath.split('/').pop() ?? repoPath
  const isFile = /\.[a-z0-9]+$/i.test(leaf)
  return `${isFile ? GITHUB_BLOB : GITHUB_TREE}${repoPath}`
}

async function diff(pages) {
  const mismatches = []
  for (const [name, content] of pages) {
    const file = path.join(contentRoot, name)
    let current
    try {
      current = await readFile(file, 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        mismatches.push(path.relative(repoRoot, file))
        continue
      }
      throw error
    }
    if (current !== content) mismatches.push(path.relative(repoRoot, file))
  }
  const existing = await listGenerated()
  for (const rel of existing) {
    if (!pages.has(rel))
      mismatches.push(path.join('site/src/content/docs', rel))
  }
  return mismatches
}

async function listGenerated() {
  const out = []
  for (const dir of generatedDirs) {
    let names = []
    try {
      names = await readdir(dir)
    } catch (error) {
      if (!(error && error.code === 'ENOENT')) throw error
      continue
    }
    const folder = path.basename(dir)
    for (const name of names) {
      if (name.endsWith('.md')) out.push(`${folder}/${name}`)
    }
  }
  for (const name of ['getting-started.md', 'tutorial.md', 'protocol.md']) {
    try {
      await readFile(path.join(contentRoot, name))
      out.push(name)
    } catch (error) {
      if (!(error && error.code === 'ENOENT')) throw error
    }
  }
  return out
}

async function writePages(pages) {
  for (const dir of generatedDirs) {
    await mkdir(dir, { recursive: true })
    let existing = []
    try {
      existing = await readdir(dir)
    } catch (error) {
      if (!(error && error.code === 'ENOENT')) throw error
    }
    const folder = path.basename(dir)
    for (const name of existing) {
      if (name.endsWith('.md') && !pages.has(`${folder}/${name}`)) {
        await rm(path.join(dir, name))
      }
    }
  }
  for (const [name, content] of pages) {
    const file = path.join(contentRoot, name)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, content)
  }
}
