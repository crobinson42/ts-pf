import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { oc, isContractProcedure, isContractRouter } from '@ts-pf/contract'

describe('oc builder', () => {
  it('builds a procedure with input, output, errors, meta', () => {
    const proc = oc
      .meta({ auth: true })
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({ NOT_FOUND: { status: 404 } })

    expect(isContractProcedure(proc)).toBe(true)
    expect(proc['~pf'].meta).toEqual({ auth: true })
    expect(proc['~pf'].errors).toEqual({ NOT_FOUND: { status: 404 } })
    expect(proc['~pf'].input).toBeDefined()
    expect(proc['~pf'].output).toBeDefined()
  })

  it('throws when input is set twice', () => {
    expect(() => oc.input(z.string()).input(z.number())).toThrow(/input/i)
  })

  it('throws when output is set twice', () => {
    expect(() => oc.output(z.string()).output(z.number())).toThrow(/output/i)
  })

  it('oc.router brands a nested object', () => {
    const contract = oc.router({
      planet: {
        find: oc.input(z.object({ id: z.number() })).output(z.object({ id: z.number() })),
      },
    })
    expect(isContractRouter(contract)).toBe(true)
    expect(isContractProcedure(contract.planet.find)).toBe(true)
  })

  it('oc.router throws on a non-procedure leaf', () => {
    expect(() =>
      oc.router({
        bad: { not: 'a procedure' },
      }),
    ).toThrow(/procedure/i)
  })
})
