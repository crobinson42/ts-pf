import { isUnexpectedError, localFailure, PFError } from '@ts-pf/protocol'
import { describe, expect, expectTypeOf, it } from 'vitest'

describe('isUnexpectedError', () => {
  it('is true for any value that is not a PFError', () => {
    expect(isUnexpectedError(new TypeError('boom'))).toBe(true)
    expect(isUnexpectedError('boom')).toBe(true)
    expect(isUnexpectedError(undefined)).toBe(true)
    expect(isUnexpectedError({ code: 'NOT_FOUND', message: 'x' })).toBe(true)
  })

  it('is true for an INTERNAL PFError, local or not', () => {
    expect(isUnexpectedError(new PFError({ code: 'INTERNAL' }))).toBe(true)
    expect(isUnexpectedError(localFailure('Request aborted'))).toBe(true)
  })

  it('is false for any other PFError code', () => {
    expect(isUnexpectedError(new PFError({ code: 'NOT_FOUND' }))).toBe(false)
    expect(isUnexpectedError(new PFError({ code: 'VALIDATION' }))).toBe(false)
    expect(
      isUnexpectedError(new PFError({ code: 'Lagging', status: 409 })),
    ).toBe(false)
  })

  it('does not unwrap cause', () => {
    const wrapped = new PFError({
      code: 'BAD_GATEWAY',
      cause: new TypeError('upstream'),
    })
    expect(isUnexpectedError(wrapped)).toBe(false)
  })

  it('is typed (error: unknown) => boolean', () => {
    expectTypeOf(isUnexpectedError).toEqualTypeOf<(error: unknown) => boolean>()
  })
})
