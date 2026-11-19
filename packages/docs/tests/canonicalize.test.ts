import { canonicalize } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'

describe('canonicalize', () => {
  it('sorts object keys at every depth and keeps array order', () => {
    const value = { b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } }
    expect(JSON.stringify(canonicalize(value))).toBe(
      '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}',
    )
  })

  it('returns primitives as they are and does not mutate its input', () => {
    expect(canonicalize('x')).toBe('x')
    const input = { b: 1, a: 2 }
    canonicalize(input)
    expect(Object.keys(input)).toEqual(['b', 'a'])
  })
})
