// Checked by `tsc --noEmit` (type-check); not run by Vitest.
import { describe, expectTypeOf, it } from 'vitest'
import {
  type EnvelopeTextCodec,
  JSONCodec,
  type RpcCodec,
} from '../src/index.js'

describe('RpcCodec.streams', () => {
  it('is an optional boolean', () => {
    expectTypeOf<RpcCodec['streams']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<EnvelopeTextCodec['streams']>().toEqualTypeOf<
      boolean | undefined
    >()
  })

  it('is false on JSONCodec, typed as boolean', () => {
    expectTypeOf(new JSONCodec().streams).toEqualTypeOf<boolean>()
  })
})
