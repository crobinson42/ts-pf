import type { ValidationIssue } from '@ts-pf/contract'
import type { PFError } from '@ts-pf/protocol'
import { validationError } from '@ts-pf/server'
import { describe, expectTypeOf, it } from 'vitest'

describe('validationError types', () => {
  it('takes readonly ValidationIssues and returns a PFError', () => {
    expectTypeOf(validationError).parameters.toEqualTypeOf<
      [ReadonlyArray<ValidationIssue>]
    >()
    expectTypeOf(validationError).returns.toEqualTypeOf<PFError>()
  })
})
