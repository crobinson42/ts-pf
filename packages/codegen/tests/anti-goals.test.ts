import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { emit } from '@ts-pf/codegen'
import { describe, expect, it } from 'vitest'
import { planetCatalog } from './planet-catalog.js'

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../src')

describe('anti-goals', () => {
  it('does not import runtime contract, client, server, zod, or typebox from src', () => {
    const files = readdirSync(srcDir).filter((name) => name.endsWith('.ts'))
    const forbidden = [
      '@ts-pf/contract',
      '@ts-pf/client',
      '@ts-pf/server',
      '@ts-pf/stream',
      '@ts-pf/sse',
      '@ts-pf/file',
      'zod',
      'typebox',
    ]
    const importRe =
      /(?:^|\n)import(?:\s+type)?\s+(?:[\s\S]*?)\sfrom\s+['"]([^'"]+)['"]/g
    for (const file of files) {
      const source = readFileSync(join(srcDir, file), 'utf8')
      const imports = [...source.matchAll(importRe)].map((match) => match[1])
      for (const pkg of forbidden) {
        expect(imports, `${file} imports ${pkg}`).not.toContain(pkg)
      }
    }
  })

  it('generated .d.ts is types-only POST RPC (no REST)', () => {
    const dts = emit(planetCatalog())
    expect(dts).toMatch(/^import type /m)
    expect(dts).not.toMatch(/^import \{/m)
    expect(dts).not.toMatch(/\bGET\b/)
    expect(dts).not.toMatch(/\bPUT\b/)
    expect(dts).not.toMatch(/\bPATCH\b/)
    expect(dts).not.toMatch(/\bDELETE\b/)
    expect(dts).not.toMatch(/path params/i)
    expect(dts).toContain('ContractProcedure')
    expect(dts).toContain("from '@ts-pf/contract'")
    expect(dts).not.toContain('@ts-pf/server')
  })
})
