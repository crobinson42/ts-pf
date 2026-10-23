import { PFError, type RpcFailure, toWireError } from '@ts-pf/protocol'
import { describe, expect, expectTypeOf, it } from 'vitest'

const INTERNAL = { code: 'INTERNAL', message: 'Internal server error' }

describe('toWireError', () => {
  it('is a PFError toJSON, with data when present', () => {
    const err = new PFError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'missing',
      data: { id: 9 },
    })
    const wire = toWireError(err)
    expect(wire).toEqual({
      code: 'NOT_FOUND',
      message: 'missing',
      data: { id: 9 },
    })
    expect(wire).toEqual(err.toJSON())
    expect(Object.keys(wire)).toEqual(['code', 'message', 'data'])
    expectTypeOf(wire).toEqualTypeOf<RpcFailure['error']>()
  })

  it('omits data, status, cause, and local from a PFError', () => {
    const err = new PFError({
      code: 'INTERNAL',
      status: 0,
      local: true,
      message: 'fetch failed',
      cause: new Error('ECONNREFUSED'),
    })
    expect(toWireError(err)).toEqual({
      code: 'INTERNAL',
      message: 'fetch failed',
    })
    expect(Object.keys(toWireError(err))).toEqual(['code', 'message'])
  })

  it('maps an unknown throw to a fixed INTERNAL with no leak', () => {
    const wire = toWireError(new TypeError('secret: db password is hunter2'))
    expect(wire).toEqual(INTERNAL)
    expect('data' in wire).toBe(false)
    expect(JSON.stringify(wire)).not.toContain('hunter2')
    expect(JSON.stringify(wire)).not.toContain('stack')
  })

  it('maps non-Error throws the same way', () => {
    expect(toWireError('boom')).toEqual(INTERNAL)
    expect(toWireError({ code: 'FAKE', message: 'not a PFError' })).toEqual(
      INTERNAL,
    )
    expect(toWireError(undefined)).toEqual(INTERNAL)
    expect(toWireError(null)).toEqual(INTERNAL)
  })
})
