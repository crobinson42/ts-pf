import { catalogHash, type EmitOptions, emit } from '@ts-pf/codegen'
import { describe, expect, expectTypeOf, it } from 'vitest'

describe('public exports', () => {
  it('exports emit and catalogHash', () => {
    expect(typeof emit).toBe('function')
    expect(typeof catalogHash).toBe('function')
    expectTypeOf<EmitOptions['name']>('Contract')
  })

  it('does not export createClientFromCatalog', async () => {
    const mod = await import('@ts-pf/codegen')
    expect(mod).not.toHaveProperty('createClientFromCatalog')
  })
})
