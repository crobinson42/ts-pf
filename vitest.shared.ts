import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

type PackageJson = {
  name: string
  exports: Record<string, { import: string }>
}

/**
 * Vitest `resolve.alias` entries that map a package's own name — and every
 * `exports` subpath such as `@ts-pf/message/stdio` — to the matching `src`
 * module, so a package's tests never run against a stale `dist`.
 * Cross-package imports are untouched and still resolve to `dist`.
 *
 * Usage in `packages/<pkg>/vitest.config.ts`: `selfAlias(import.meta.url)`.
 */
export function selfAlias(
  configUrl: string,
): Array<{ find: RegExp; replacement: string }> {
  const dir = new URL('./', configUrl)
  const pkg = JSON.parse(
    readFileSync(new URL('package.json', dir), 'utf8'),
  ) as PackageJson
  return Object.entries(pkg.exports).map(([subpath, entry]) => {
    const specifier = subpath === '.' ? pkg.name : pkg.name + subpath.slice(1)
    const source = entry.import
      .replace(/^\.\/dist\//, 'src/')
      .replace(/\.js$/, '.ts')
    return {
      find: new RegExp(
        `^${specifier.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`,
      ),
      replacement: fileURLToPath(new URL(source, dir)),
    }
  })
}
