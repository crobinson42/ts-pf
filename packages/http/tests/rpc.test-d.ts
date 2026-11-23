// Checked by `tsc --noEmit` (type-check); not run by Vitest.
import { describe, expectTypeOf, it } from 'vitest'
import {
  type EnvelopeTextCodec,
  JsonCodec,
  type RpcCodec,
} from '../src/index.js'

describe('RpcCodec.streams', () => {
  it('is an optional boolean', () => {
    expectTypeOf<RpcCodec['streams']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<EnvelopeTextCodec['streams']>().toEqualTypeOf<
      boolean | undefined
    >()
  })

  it('is false on JsonCodec, typed as boolean', () => {
    expectTypeOf(new JsonCodec().streams).toEqualTypeOf<boolean>()
  })
})
