// Checked by `tsc --noEmit` (type-check); not run by Vitest.
import { describe, expectTypeOf, it } from 'vitest'
import type { OpenAPIOptions } from '../src/index.js'

const info = { title: 'Library API', version: '1' }

describe('OpenAPIOptions profile options', () => {
  it('accepts the profile and every option value', () => {
    const codegen: OpenAPIOptions = { info, profile: 'codegen' }
    const each: OpenAPIOptions = {
      info,
      envelopes: 'inline',
      errors: 'shared',
      naming: 'pascal',
      closeInputs: true,
      constAsEnum: 'exceptTags',
      dropFormatPatterns: true,
      emptyInputNull: true,
    }
    const defaults: OpenAPIOptions = {
      info,
      profile: 'codegen',
      envelopes: 'components',
      errors: 'per-code',
      naming: 'path',
      closeInputs: false,
      constAsEnum: false,
      dropFormatPatterns: false,
      emptyInputNull: false,
    }
    expectTypeOf(codegen).toEqualTypeOf<OpenAPIOptions>()
    expectTypeOf(each).toEqualTypeOf<OpenAPIOptions>()
    expectTypeOf(defaults).toEqualTypeOf<OpenAPIOptions>()
  })

  it('rejects unknown values', () => {
    // @ts-expect-error unknown profile
    const profile: OpenAPIOptions = { info, profile: 'rest' }
    // @ts-expect-error unknown envelopes value
    const envelopes: OpenAPIOptions = { info, envelopes: 'flat' }
    // @ts-expect-error unknown errors value
    const errors: OpenAPIOptions = { info, errors: 'per-procedure' }
    // @ts-expect-error unknown naming value
    const naming: OpenAPIOptions = { info, naming: 'camel' }
    // @ts-expect-error constAsEnum takes false or 'exceptTags'
    const constAsEnum: OpenAPIOptions = { info, constAsEnum: true }
    // @ts-expect-error closeInputs is a boolean
    const closeInputs: OpenAPIOptions = { info, closeInputs: 'yes' }
    expectTypeOf([
      profile,
      envelopes,
      errors,
      naming,
      constAsEnum,
      closeInputs,
    ]).toBeArray()
  })

  it('types x-ts-pf-errors on operations', () => {
    type Operation = NonNullable<import('../src/types.js').PathItem['post']>
    expectTypeOf<Operation['x-ts-pf-errors']>().toEqualTypeOf<
      string[] | undefined
    >()
  })
})
