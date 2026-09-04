import { localFailure, PFError } from '@ts-pf/protocol'
import { describe, expect, it } from 'vitest'
import { httpStatus } from '../src/index.js'

describe('httpStatus', () => {
  it('maps protocol codes to the HTTP table', () => {
    expect(httpStatus(new PFError({ code: 'VALIDATION' }))).toBe(422)
    expect(httpStatus(new PFError({ code: 'NOT_FOUND' }))).toBe(404)
    expect(httpStatus(new PFError({ code: 'INTERNAL' }))).toBe(500)
    expect(httpStatus(new PFError({ code: 'METHOD_NOT_ALLOWED' }))).toBe(405)
    expect(httpStatus(new PFError({ code: 'PAYLOAD_TOO_LARGE' }))).toBe(413)
    expect(httpStatus(new PFError({ code: 'BAD_REQUEST' }))).toBe(400)
  })

  it('uses declared status for non-protocol codes', () => {
    expect(httpStatus(new PFError({ code: 'UNAUTHORIZED', status: 401 }))).toBe(
      401,
    )
    expect(httpStatus(new PFError({ code: 'PAYMENT_REQUIRED' }))).toBe(400)
  })

  it('returns 0 for local failures', () => {
    expect(httpStatus(localFailure('Request aborted'))).toBe(0)
  })
})
