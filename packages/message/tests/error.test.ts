import { isPFError } from '@ts-pf/protocol'
import { describe, expect, it } from 'vitest'
import { errorFromEnvelope, localFailure } from '../src/error.js'

const PROTOCOL_CODES = {
  BAD_REQUEST: 400,
  VALIDATION: 422,
  NOT_FOUND: 404,
  INTERNAL: 500,
  METHOD_NOT_ALLOWED: 405,
  PAYLOAD_TOO_LARGE: 413,
} as const

describe('errorFromEnvelope', () => {
  it('maps protocol codes to the status table', () => {
    for (const [code, status] of Object.entries(PROTOCOL_CODES)) {
      const error = errorFromEnvelope({ code, message: code })
      expect(isPFError(error)).toBe(true)
      expect(error.code).toBe(code)
      expect(error.status).toBe(status)
      expect(error.message).toBe(code)
    }
  })

  it('maps an unknown application code to 400', () => {
    const error = errorFromEnvelope({
      code: 'NOT_EARTH',
      message: 'not a planet',
    })
    expect(error.code).toBe('NOT_EARTH')
    expect(error.status).toBe(400)
    expect(error.message).toBe('not a planet')
  })

  it('omits optional data when undefined', () => {
    const error = errorFromEnvelope({
      code: 'INTERNAL',
      message: 'Internal server error',
    })
    expect(error.data).toBeUndefined()
    expect('data' in error.toJSON()).toBe(false)
  })

  it('preserves envelope data when provided', () => {
    const data = { id: 1 }
    const error = errorFromEnvelope({
      code: 'NOT_FOUND',
      message: 'missing',
      data,
    })
    expect(error.data).toEqual(data)
    expect('data' in error).toBe(true)
  })

  it('toJSON omits status and cause', () => {
    const error = errorFromEnvelope({
      code: 'NOT_FOUND',
      message: 'missing',
      data: { id: 1 },
    })
    expect(error.toJSON()).toEqual({
      code: 'NOT_FOUND',
      message: 'missing',
      data: { id: 1 },
    })
    expect('status' in error.toJSON()).toBe(false)
    expect('cause' in error.toJSON()).toBe(false)
  })

  it('toJSON omits data when the envelope had none', () => {
    const json = errorFromEnvelope({
      code: 'BAD_REQUEST',
      message: 'nope',
    }).toJSON()
    expect(json).toEqual({ code: 'BAD_REQUEST', message: 'nope' })
    expect('data' in json).toBe(false)
  })

  it('does not reconstruct INTERNAL as status 0', () => {
    const error = errorFromEnvelope({
      code: 'INTERNAL',
      message: 'Internal server error',
    })
    expect(error.status).toBe(500)
    expect(error.status).not.toBe(0)
  })
})

describe('localFailure', () => {
  it('maps Request aborted to INTERNAL with status 0', () => {
    const error = localFailure('Request aborted')
    expect(isPFError(error)).toBe(true)
    expect(error.code).toBe('INTERNAL')
    expect(error.status).toBe(0)
    expect(error.message).toBe('Request aborted')
    expect(error.data).toBeUndefined()
    expect('data' in error.toJSON()).toBe(false)
  })

  it('sets Error.cause when provided', () => {
    const cause = new Error('socket hang up')
    const error = localFailure('Connection closed', cause)
    expect(error.cause).toBe(cause)
    expect(error.status).toBe(0)
  })

  it('omits cause when not provided', () => {
    const error = localFailure('Network error')
    expect(error.cause).toBeUndefined()
  })

  it('toJSON omits status and cause', () => {
    const cause = new Error('connect ECONNREFUSED')
    const json = localFailure('Network error', cause).toJSON()
    expect(json).toEqual({
      code: 'INTERNAL',
      message: 'Network error',
    })
    expect('status' in json).toBe(false)
    expect('cause' in json).toBe(false)
    expect('data' in json).toBe(false)
  })
})
