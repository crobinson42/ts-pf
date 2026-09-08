// Published @ts-pf/* packages must export dist. npm does not rewrite
// publishConfig.exports into the packed package.json — putting src there
// ships a tarball that cannot be imported.
import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagesDir = join(root, 'packages')
const errors = []

function distFile(kind, subpath) {
  if (kind === 'types') return subpath.replace(/\.js$/, '.d.ts')
  return subpath
}

function checkExportMap(pkgName, exports) {
  if (!exports || typeof exports !== 'object' || Array.isArray(exports)) {
    errors.push(`${pkgName}: exports must be an object`)
    return
  }
  const keys = Object.keys(exports)
  if (!keys.includes('.')) {
    errors.push(`${pkgName}: exports must include "."`)
  }
  for (const [key, value] of Object.entries(exports)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${pkgName}: exports["${key}"] must be a condition map`)
      continue
    }
    const expectedImport =
      key === '.' ? './dist/index.js' : `./dist/${key.replace(/^\.\//, '')}.js`
    if (value.import !== expectedImport) {
      errors.push(
        `${pkgName}: exports["${key}"].import must be ${expectedImport} (got ${JSON.stringify(value.import)})`,
      )
    }
    const expectedTypes = distFile('types', expectedImport)
    if (value.types !== expectedTypes) {
      errors.push(
        `${pkgName}: exports["${key}"].types must be ${expectedTypes} (got ${JSON.stringify(value.types)})`,
      )
    }
    for (const [condition, target] of Object.entries(value)) {
      if (typeof target !== 'string') {
        errors.push(`${pkgName}: exports["${key}"].${condition} must be a string`)
        continue
      }
      const sourceTs = target.endsWith('.ts') && !target.endsWith('.d.ts')
      if (target.includes('/src/') || sourceTs) {
        errors.push(
          `${pkgName}: exports["${key}"].${condition} points at source (${target})`,
        )
      }
    }
  }
}

function checkPublishConfig(pkgName, publishConfig) {
  const keys = Object.keys(publishConfig ?? {})
  if (publishConfig?.access !== 'public') {
    errors.push(`${pkgName}: publishConfig.access must be "public"`)
  }
  if (keys.some((key) => key !== 'access')) {
    errors.push(
      `${pkgName}: publishConfig must only set access (npm does not rewrite exports/main/types)`,
    )
  }
}

function listTar(tgz) {
  return execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8' })
    .trim()
    .split('\n')
}

function readTarFile(tgz, inner) {
  return execFileSync('tar', ['-xOf', tgz, inner], { encoding: 'utf8' })
}

const entries = await readdir(packagesDir, { withFileTypes: true })
const published = []

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
  published.push({ dir: entry.name, pkg })
  checkExportMap(entry.name, pkg.exports)
  checkPublishConfig(entry.name, pkg.publishConfig)
}

if (published.length === 0) {
  errors.push('no published @ts-pf/* packages found')
}

if (errors.length === 0) {
  const dest = await mkdtemp(join(tmpdir(), 'ts-pf-check-exports-'))
  try {
    for (const { dir, pkg } of published) {
      try {
        execFileSync('npm', ['pack', join(packagesDir, dir), '--pack-destination', dest], {
          stdio: 'pipe',
        })
      } catch (error) {
        const detail = error.stderr?.toString().trim() || error.message
        errors.push(`${dir}: npm pack failed (${detail})`)
        continue
      }
      const tarballs = (await readdir(dest)).filter((name) => name.endsWith('.tgz'))
      if (tarballs.length !== 1) {
        errors.push(`${dir}: npm pack produced ${tarballs.length} tarballs`)
        await Promise.all(tarballs.map((name) => rm(join(dest, name), { force: true })))
        continue
      }
      const tgz = join(dest, tarballs[0])
      const files = listTar(tgz)
      if (files.some((file) => file === 'package/src' || file.startsWith('package/src/'))) {
        errors.push(`${dir}: packed tarball includes src/`)
      }
      let packed
      try {
        packed = JSON.parse(readTarFile(tgz, 'package/package.json'))
      } catch (error) {
        errors.push(`${dir}: packed package.json missing or invalid (${error.message})`)
        await rm(tgz)
        continue
      }
      if (JSON.stringify(packed.exports) !== JSON.stringify(pkg.exports)) {
        errors.push(
          `${dir}: packed exports ${JSON.stringify(packed.exports)} !== workspace ${JSON.stringify(pkg.exports)}`,
        )
      }
      if (packed.publishConfig?.exports) {
        errors.push(`${dir}: packed package.json still has publishConfig.exports`)
      }
      for (const value of Object.values(pkg.exports ?? {})) {
        for (const target of Object.values(value)) {
          if (typeof target !== 'string') continue
          const inner = `package/${target.slice(2)}`
          if (!files.includes(inner)) {
            errors.push(`${dir}: packed tarball missing ${inner}`)
          }
        }
      }
      await rm(tgz)
    }
  } finally {
    await rm(dest, { recursive: true, force: true })
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`ok: ${published.length} packages`)
