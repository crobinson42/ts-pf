import {
  catalogHash,
  type EmitFile,
  type EmitOptions,
  emit,
  emitFiles,
} from '@ts-pf/codegen'
import { describe, expect, expectTypeOf, it } from 'vitest'

describe('public exports', () => {
  it('exports emit, emitFiles, and catalogHash', () => {
    expect(typeof emit).toBe('function')
    expect(typeof emitFiles).toBe('function')
    expect(typeof catalogHash).toBe('function')
    expectTypeOf<EmitOptions['name']>('Contract')
    expectTypeOf<EmitFile['path']>('contract.d.ts')
  })

  it('does not export createClientFromCatalog', async () => {
    const mod = await import('@ts-pf/codegen')
    expect(mod).not.toHaveProperty('createClientFromCatalog')
  })
})
