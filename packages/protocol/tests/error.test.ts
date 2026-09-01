import { isPFError, PFError } from '@ts-pf/protocol'
import { describe, expect, it } from 'vitest'

describe('PFError', () => {
  it('is an Error with code, status, data', () => {
    const err = new PFError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'missing',
      data: { id: 1 },
    })
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('PFError')
    expect(err.code).toBe('NOT_FOUND')
    expect(err.status).toBe(404)
    expect(err.data).toEqual({ id: 1 })
    expect(isPFError(err)).toBe(true)
    expect(isPFError(new Error('x'))).toBe(false)
  })

  it('defaults status to 400 and message to code', () => {
    const err = new PFError({ code: 'BAD_REQUEST' })
    expect(err.status).toBe(400)
    expect(err.message).toBe('BAD_REQUEST')
  })

  it('toJSON matches the wire error object', () => {
    const err = new PFError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'missing',
      data: { id: 1 },
    })
    expect(err.toJSON()).toEqual({
      code: 'NOT_FOUND',
      message: 'missing',
      data: { id: 1 },
    })
  })
})
