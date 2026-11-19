import { isPFError, PFError, toWireError } from '@ts-pf/protocol'
import { describe, expect, it, vi } from 'vitest'

// A second module instance of this package stands in for two installed copies
// (version skew, a bundler that inlined one): its PFError is a different class.
async function loadCopy(): Promise<typeof import('@ts-pf/protocol')> {
  vi.resetModules()
  return import('@ts-pf/protocol')
}

describe('PFError from another copy of @ts-pf/protocol', () => {
  it('is a different class, so instanceof alone would miss it', async () => {
    const copy = await loadCopy()
    expect(copy.PFError).not.toBe(PFError)
    const err = new copy.PFError({ code: 'NOT_FOUND', message: 'missing' })
    expect(err instanceof PFError).toBe(false)
  })

  it('is recognised by isPFError in both directions', async () => {
    const copy = await loadCopy()
    expect(isPFError(new copy.PFError({ code: 'NOT_FOUND' }))).toBe(true)
    expect(copy.isPFError(new PFError({ code: 'NOT_FOUND' }))).toBe(true)
  })

  it('keeps its code, message, and data through toWireError', async () => {
    const copy = await loadCopy()
    const err = new copy.PFError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'missing',
      data: { id: 1 },
    })
    expect(toWireError(err)).toEqual({
      code: 'NOT_FOUND',
      message: 'missing',
      data: { id: 1 },
    })
  })
})

describe('PFError brand', () => {
  const BRAND = Symbol.for('ts-pf.PFError')

  it('lives on the prototype, not on instances', () => {
    const err = new PFError({ code: 'NOT_FOUND', status: 404, data: { id: 1 } })
    expect(Object.hasOwn(err, BRAND)).toBe(false)
    expect(Object.getOwnPropertySymbols(err)).toEqual([])
    expect(Object.keys(err)).toEqual([
      'code',
      'status',
      'data',
      'local',
      'name',
    ])
    expect(err.toJSON()).toEqual({
      code: 'NOT_FOUND',
      message: 'NOT_FOUND',
      data: { id: 1 },
    })
    const descriptor = Object.getOwnPropertyDescriptor(PFError.prototype, BRAND)
    expect(descriptor).toMatchObject({ value: true, enumerable: false })
  })

  it('does not change deep equality between errors', () => {
    expect(new PFError({ code: 'A', message: 'x' })).toEqual(
      new PFError({ code: 'A', message: 'x' }),
    )
  })

  it('accepts any object carrying the brand and rejects look-alikes', () => {
    expect(isPFError({ [BRAND]: true, code: 'X', message: 'y' })).toBe(true)
    expect(isPFError({ code: 'X', message: 'y', name: 'PFError' })).toBe(false)
    expect(isPFError({ [BRAND]: 'yes' })).toBe(false)
    expect(isPFError(null)).toBe(false)
    expect(isPFError('PFError')).toBe(false)
  })
})
