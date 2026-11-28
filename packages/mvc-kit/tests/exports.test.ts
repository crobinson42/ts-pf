import {
  bindClient,
  type DisposeSignalHost,
  issuesToFieldErrors,
  taskIssues,
} from '@ts-pf/mvc-kit'
import { describe, expect, expectTypeOf, it } from 'vitest'

describe('public exports', () => {
  it('exports bindClient, issuesToFieldErrors, taskIssues, and DisposeSignalHost', () => {
    expect(typeof bindClient).toBe('function')
    expect(typeof issuesToFieldErrors).toBe('function')
    expect(typeof taskIssues).toBe('function')
    expectTypeOf<
      DisposeSignalHost['disposeSignal']
    >().toEqualTypeOf<AbortSignal>()
  })
})
