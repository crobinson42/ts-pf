import {
  type CreateSwrOptions,
  createSwr,
  type SwrClient,
  type SwrFetcher,
  type SwrKey,
  type SwrMatcher,
  type SwrMutator,
  type SwrProcedureUtils,
  type SwrSubscriber,
} from '@ts-pf/swr'
import { describe, expect, expectTypeOf, it } from 'vitest'

describe('public exports', () => {
  it('exports createSwr and the helper types', () => {
    expect(typeof createSwr).toBe('function')
    expectTypeOf<CreateSwrOptions['prefix']>().toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf<SwrKey>().toMatchTypeOf<
      | readonly [readonly string[], { readonly input?: unknown }]
      | readonly [string, readonly string[], { readonly input?: unknown }]
    >()
    expectTypeOf<SwrFetcher>().toBeFunction()
    expectTypeOf<SwrMutator>().toBeFunction()
    expectTypeOf<SwrMatcher>().toBeFunction()
    expectTypeOf<SwrSubscriber<unknown, unknown>>().toBeFunction()
    expectTypeOf<SwrProcedureUtils<void, string, {}>['call']>().toBeFunction()
    type ListClient = SwrClient<{
      planet: {
        list: unknown
      }
    }>
    expectTypeOf<ListClient['matcher']>().toBeFunction()
  })
})
