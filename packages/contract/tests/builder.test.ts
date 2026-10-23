import {
  isContractProcedure,
  isContractRouter,
  procedure,
  router,
} from '@ts-pf/contract'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

describe('procedure builder', () => {
  it('builds a procedure with input, output, errors, meta', () => {
    const proc = procedure
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

  it('.meta() merges across calls and survives later builder steps', () => {
    const proc = procedure
      .meta({ auth: true })
      .meta({ tag: 'planet' })
      .input(z.object({ id: z.number() }))
      .output(z.string())
      .errors({ GONE: { status: 410 } })
      .meta({ auth: false })

    expect(proc['~pf'].meta).toEqual({ auth: false, tag: 'planet' })
    expect(proc['~pf'].type).toBe('procedure')
    expect(isContractProcedure(proc)).toBe(true)
  })

  it('.meta() does not mutate the previous builder', () => {
    const base = procedure.meta({ auth: true })
    const derived = base.meta({ tag: 'planet' })
    expect(base['~pf'].meta).toEqual({ auth: true })
    expect(derived['~pf'].meta).toEqual({ auth: true, tag: 'planet' })
    expect(procedure['~pf'].meta).toEqual({})
  })

  it('$meta<M>() declares the meta type and starts from an empty bag', () => {
    const proc = procedure
      .$meta<{ auth: boolean }>()
      .meta({ auth: true })
      .input(z.object({ id: z.number() }))
    expect(proc['~pf'].meta).toEqual({ auth: true })
    expect(proc['~pf'].input).toBeDefined()
  })

  it('$meta<M>() resets meta set before it', () => {
    // $meta() is a type declaration; its runtime value is a fresh `{}`.
    const proc = procedure.meta({ tag: 'planet' }).$meta<{ auth: boolean }>()
    expect(proc['~pf'].meta).toEqual({})
  })

  it('throws when input is set twice', () => {
    expect(() => procedure.input(z.string()).input(z.number())).toThrow(
      /input/i,
    )
  })

  it('throws when output is set twice', () => {
    expect(() => procedure.output(z.string()).output(z.number())).toThrow(
      /output/i,
    )
  })

  it('router() brands a nested object', () => {
    const contract = router({
      planet: {
        find: procedure
          .input(z.object({ id: z.number() }))
          .output(z.object({ id: z.number() })),
      },
    })
    expect(isContractRouter(contract)).toBe(true)
    expect(isContractProcedure(contract.planet.find)).toBe(true)
  })

  it('router() nests branded slice routers', () => {
    const planet = router({
      find: procedure
        .input(z.object({ id: z.number() }))
        .output(z.object({ id: z.number() })),
    })
    const star = router({
      find: procedure.output(z.object({ id: z.number() })),
    })
    const contract = router({ planet, star })
    expect(isContractRouter(contract)).toBe(true)
    expect(isContractRouter(contract.planet)).toBe(true)
    expect(isContractProcedure(contract.planet.find)).toBe(true)
    expect(isContractProcedure(contract.star.find)).toBe(true)
  })

  it('router() throws on a non-procedure leaf', () => {
    expect(() =>
      router({
        bad: { not: 'a procedure' },
      }),
    ).toThrow(/procedure/i)
  })
})
