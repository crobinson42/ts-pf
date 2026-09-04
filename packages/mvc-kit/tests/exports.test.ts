import {
  bindClient,
  type DisposeSignalHost,
  issuesToFieldErrors,
} from '@ts-pf/mvc-kit'
import { describe, expect, expectTypeOf, it } from 'vitest'

describe('public exports', () => {
  it('exports bindClient, issuesToFieldErrors, and DisposeSignalHost', () => {
    expect(typeof bindClient).toBe('function')
    expect(typeof issuesToFieldErrors).toBe('function')
    expectTypeOf<
      DisposeSignalHost['disposeSignal']
    >().toEqualTypeOf<AbortSignal>()
  })
})
