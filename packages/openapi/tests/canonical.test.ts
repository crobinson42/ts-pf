import { catalog, type ProcedureCatalog } from '@ts-pf/docs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openapi } from '../src/openapi.js'
import { appContract, codegenAppContract } from './app-contract.js'

const info = { title: 'Library API', version: '1' }

/** A copy with every object's keys in reverse order (arrays unchanged). */
function reverseKeys<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(reverseKeys) as T
  }
  const entries = Object.entries(value).reverse()
  return Object.fromEntries(
    entries.map(([key, child]) => [key, reverseKeys(child)]),
  ) as T
}

function keyOrders(value: unknown, acc: string[][] = []): string[][] {
  if (value !== null && typeof value === 'object') {
    if (!Array.isArray(value)) {
      acc.push(Object.keys(value))
    }
    for (const child of Object.values(value)) {
      keyOrders(child, acc)
    }
  }
  return acc
}

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warn.mockRestore()
})

describe('canonical', () => {
  const cat = catalog(codegenAppContract, { prefix: '/rpc' })

  it('sorts keys at every depth', () => {
    const spec = openapi(cat, { info, canonical: true })
    for (const keys of keyOrders(spec)) {
      expect(keys).toEqual([...keys].sort())
    }
  })

  it('is byte-stable for catalogs built in different key orders', () => {
    const reversed: ProcedureCatalog = reverseKeys(cat)
    expect(JSON.stringify(reversed)).not.toBe(JSON.stringify(cat))
    for (const options of [
      { canonical: true },
      { profile: 'codegen' as const },
    ]) {
      expect(JSON.stringify(openapi(reversed, { info, ...options }))).toBe(
        JSON.stringify(openapi(cat, { info, ...options })),
      )
    }
  })

  it('is off by default', () => {
    const spec = openapi(catalog(appContract), { info })
    expect(Object.keys(spec)[0]).toBe('openapi')
  })
})

describe('catalogHash', () => {
  it("writes info['x-ts-pf-catalog-hash']", () => {
    const spec = openapi(catalog(appContract), {
      info,
      catalogHash: 'sha256-abc',
    })
    expect(spec.info).toEqual({ ...info, 'x-ts-pf-catalog-hash': 'sha256-abc' })
  })

  it('is absent unless passed', () => {
    const spec = openapi(catalog(codegenAppContract), {
      info,
      profile: 'codegen',
    })
    expect(spec.info).not.toHaveProperty('x-ts-pf-catalog-hash')
  })
})
