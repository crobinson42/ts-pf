import { emit } from '@ts-pf/codegen'
import { catalog } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { contract } from '../src/contract.js'

describe('14-codegen', () => {
  const dts = emit(catalog(contract, { prefix: '/rpc' }))

  it('prints a nested ContractProcedure tree and omits hidden', () => {
    expect(dts).toContain(
      "import type { ContractProcedure } from '@ts-pf/contract'",
    )
    expect(dts).toContain('export type Contract = {')
    expect(dts).toContain('planet: {')
    expect(dts).toContain('find: ContractProcedure<')
    expect(dts).toContain('list: ContractProcedure<void,')
    expect(dts).toContain('create: ContractProcedure<')
    expect(dts).toContain('AsyncIterable<{ token: string }>')
    expect(dts).toContain('type Phantom<T>')
    expect(dts).toContain('data: Phantom<{ id: number }>')
    expect(dts).not.toContain('hidden')
    expect(dts).not.toMatch(/\bGET\b/)
    expect(dts).not.toMatch(/\bPUT\b/)
  })

  it('round-trips the catalog through JSON', () => {
    const spec = catalog(contract, { prefix: '/rpc' })
    expect(emit(JSON.parse(JSON.stringify(spec)))).toBe(dts)
  })
})
