import type { ContractProtocolErrorCode } from '@ts-pf/contract'
import type { ProtocolErrorCode } from '@ts-pf/protocol'
import { describe, expectTypeOf, it } from 'vitest'

// contract must not import protocol, so it carries a hand-written duplicate
// of the closed code set. server sees both packages; keep them equal here.
type ProtocolErrorCodeValue =
  (typeof ProtocolErrorCode)[keyof typeof ProtocolErrorCode]

describe('ProtocolErrorCode duplicates', () => {
  it('contract union equals the protocol const values', () => {
    expectTypeOf<ContractProtocolErrorCode>().toEqualTypeOf<ProtocolErrorCodeValue>()
  })
})
