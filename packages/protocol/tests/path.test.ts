import { joinProcedurePath, parseProcedurePath } from '@ts-pf/protocol'
import { describe, expect, it } from 'vitest'

describe('procedure path', () => {
  it('joins prefix and segments', () => {
    expect(joinProcedurePath('/rpc', ['planet', 'find'])).toBe(
      '/rpc/planet/find',
    )
    expect(joinProcedurePath('/rpc/', ['planet', 'find'])).toBe(
      '/rpc/planet/find',
    )
    expect(joinProcedurePath('rpc', ['planet', 'find'])).toBe(
      '/rpc/planet/find',
    )
  })

  it('parses pathname against prefix', () => {
    expect(parseProcedurePath('/rpc/planet/find', '/rpc')).toEqual([
      'planet',
      'find',
    ])
    expect(parseProcedurePath('/api/planet/find', '/rpc')).toBeNull()
    expect(parseProcedurePath('/rpc', '/rpc')).toEqual([])
    expect(parseProcedurePath('/rpc/', '/rpc')).toEqual([])
  })
})
