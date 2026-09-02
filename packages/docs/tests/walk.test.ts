import { isContractProcedure, procedure, router } from '@ts-pf/contract'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { walkContract } from '../src/walk.js'

describe('walkContract', () => {
  it('yields nested procedures with path segments and skips ~pf', () => {
    const find = procedure.input(z.object({ id: z.number() }))
    const list = procedure.output(z.array(z.object({ id: z.number() })))
    const contract = router({
      planet: { find, list },
    })

    const entries = walkContract(contract)
    expect(entries.map((e) => e.path)).toEqual([
      ['planet', 'find'],
      ['planet', 'list'],
    ])
    expect(entries[0]?.procedure).toBe(find)
    expect(isContractProcedure(entries[0]?.procedure)).toBe(true)
  })

  it('walks a single procedure as a one-entry catalog root', () => {
    const ping = procedure.output(z.string())
    expect(walkContract(ping)).toEqual([{ path: [], procedure: ping }])
  })

  it('throws on a non-procedure leaf', () => {
    expect(() => walkContract({ bad: { not: 'a procedure' } })).toThrow(
      /procedure/i,
    )
  })
})
