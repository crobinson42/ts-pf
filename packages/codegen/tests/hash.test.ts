import { catalogHash } from '@ts-pf/codegen'
import { describe, expect, it } from 'vitest'
import { planetCatalog } from './planet-catalog.js'

describe('catalogHash', () => {
  it('is independent of object key order', () => {
    const catalog = planetCatalog()
    const shuffled = JSON.parse(
      JSON.stringify(catalog, (_key, value: unknown) => {
        if (
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          const record = value as Record<string, unknown>
          const reversed: Record<string, unknown> = {}
          for (const k of Object.keys(record).reverse()) {
            reversed[k] = record[k]
          }
          return reversed
        }
        return value
      }),
    ) as typeof catalog
    expect(catalogHash(shuffled)).toBe(catalogHash(catalog))
  })

  it('prefixes sha256', () => {
    expect(catalogHash(planetCatalog())).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
})
