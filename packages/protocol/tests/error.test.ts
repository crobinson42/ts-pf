import { isPFError, localFailure, PFError } from '@ts-pf/protocol'
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

  it('preserves cause and omits it from toJSON', () => {
    const cause = new Error('connect ECONNREFUSED 127.0.0.1:80')
    const err = new PFError({
      code: 'INTERNAL',
      status: 0,
      local: true,
      message: 'fetch failed',
      cause,
    })
    expect(err.cause).toBe(cause)
    expect(err.local).toBe(true)
    expect(err.toJSON()).toEqual({
      code: 'INTERNAL',
      message: 'fetch failed',
    })
    expect('local' in err.toJSON()).toBe(false)
  })

  it('omits cause when not provided', () => {
    const err = new PFError({ code: 'INTERNAL', message: 'x' })
    expect(err.cause).toBeUndefined()
  })

  it('omits local when not provided', () => {
    const err = new PFError({ code: 'INTERNAL', message: 'x' })
    expect(err.local).toBeUndefined()
  })
})

describe('localFailure', () => {
  it('is INTERNAL with local true and status 0', () => {
    const err = localFailure('Request aborted')
    expect(isPFError(err)).toBe(true)
    expect(err.code).toBe('INTERNAL')
    expect(err.local).toBe(true)
    expect(err.status).toBe(0)
    expect(err.message).toBe('Request aborted')
    expect(err.toJSON()).toEqual({
      code: 'INTERNAL',
      message: 'Request aborted',
    })
    expect('local' in err.toJSON()).toBe(false)
    expect('status' in err.toJSON()).toBe(false)
  })

  it('sets cause when provided', () => {
    const cause = new Error('socket hang up')
    const err = localFailure('Connection closed', cause)
    expect(err.cause).toBe(cause)
  })
})
