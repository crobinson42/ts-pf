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
      discriminators: true,
      hoist: 'objects',
      canonical: true,
      streams: 'components',
      enumNames: { BookStatus: ['available', 'loaned'], Level: [1, 2] },
      catalogHash: 'sha256-abc',
    }
    const omit: OpenAPIOptions = { info, streams: 'omit' }
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
      discriminators: false,
      hoist: 'none',
      canonical: false,
      streams: 'operation',
    }
    expectTypeOf(codegen).toEqualTypeOf<OpenAPIOptions>()
    expectTypeOf(each).toEqualTypeOf<OpenAPIOptions>()
    expectTypeOf(omit).toEqualTypeOf<OpenAPIOptions>()
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
    // @ts-expect-error unknown hoist value
    const hoist: OpenAPIOptions = { info, hoist: 'all' }
    // @ts-expect-error hoist takes 'none' or 'objects', not a boolean
    const hoistBool: OpenAPIOptions = { info, hoist: true }
    // @ts-expect-error unknown streams value
    const streams: OpenAPIOptions = { info, streams: 'paths' }
    // @ts-expect-error discriminators is a boolean
    const discriminators: OpenAPIOptions = { info, discriminators: 'kind' }
    // @ts-expect-error canonical is a boolean
    const canonical: OpenAPIOptions = { info, canonical: 'sorted' }
    // @ts-expect-error enumNames maps a name to its values
    const enumNames: OpenAPIOptions = { info, enumNames: ['a', 'b'] }
    // @ts-expect-error catalogHash is a string
    const catalogHash: OpenAPIOptions = { info, catalogHash: 1 }
    expectTypeOf([
      profile,
      envelopes,
      errors,
      naming,
      constAsEnum,
      closeInputs,
      hoist,
      hoistBool,
      streams,
      discriminators,
      canonical,
      enumNames,
      catalogHash,
    ]).toBeArray()
  })

  it('types the x-ts-pf-streams map and the catalog hash', () => {
    type Document = import('../src/index.js').OpenAPIDocument
    type Entry = NonNullable<Document['x-ts-pf-streams']>[string]
    expectTypeOf<Entry['errors']>().toEqualTypeOf<string[]>()
    expectTypeOf<Document['info']['x-ts-pf-catalog-hash']>().toEqualTypeOf<
      string | undefined
    >()
  })

  it('types x-ts-pf-errors on operations', () => {
    type Operation = NonNullable<import('../src/types.js').PathItem['post']>
    expectTypeOf<Operation['x-ts-pf-errors']>().toEqualTypeOf<
      string[] | undefined
    >()
  })
})
