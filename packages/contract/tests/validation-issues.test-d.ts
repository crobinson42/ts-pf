import type { StandardSchemaV1 } from '@standard-schema/spec'
import { toValidationIssues, type ValidationIssue } from '@ts-pf/contract'
import { describe, expectTypeOf, it } from 'vitest'

describe('toValidationIssues types', () => {
  it('takes readonly Standard Schema issues and returns ValidationIssue[]', () => {
    expectTypeOf(toValidationIssues).parameters.toEqualTypeOf<
      [ReadonlyArray<StandardSchemaV1.Issue>]
    >()
    expectTypeOf(toValidationIssues).returns.toEqualTypeOf<ValidationIssue[]>()
  })
})
