import { PROTOCOL_MAJOR, PROTOCOL_VERSION } from '@ts-pf/protocol'
import { describe, expect, expectTypeOf, it } from 'vitest'

describe('protocol version constants', () => {
  it('derives the header string from the wire major', () => {
    expect(PROTOCOL_MAJOR).toBe(1)
    expect(PROTOCOL_VERSION).toBe('1')
    expect(String(PROTOCOL_MAJOR)).toBe(PROTOCOL_VERSION)
  })

  it('keeps both as literal types', () => {
    expectTypeOf(PROTOCOL_MAJOR).toEqualTypeOf<1>()
    expectTypeOf(PROTOCOL_VERSION).toEqualTypeOf<'1'>()
  })
})
