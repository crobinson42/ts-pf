import { asResult, createClient, type Link } from '@ts-pf/client'
import type { ContractClient } from '@ts-pf/contract'
import { describe, expectTypeOf, it } from 'vitest'
import type { Contract } from './fixtures/planet.js'

const link: Link = {
  call: () =>
    Promise.reject(new Error('not called')) as ReturnType<Link['call']>,
}

const client = createClient<Contract>(link)

describe('createClient<Contract>', () => {
  it('types find as a one-arg client and list as zero-arg', () => {
    expectTypeOf(client.planet.find).parameters.toEqualTypeOf<
      [{ id: number }, { signal?: AbortSignal }?]
    >()
    expectTypeOf(client.planet.list).parameters.toEqualTypeOf<
      [{ signal?: AbortSignal }?]
    >()
    expectTypeOf<
      ContractClient<Contract>['planet']['find']
    >().parameters.toEqualTypeOf<[{ id: number }, { signal?: AbortSignal }?]>()
    expectTypeOf<
      ContractClient<Contract>['planet']['list']
    >().parameters.toEqualTypeOf<[{ signal?: AbortSignal }?]>()
  })

  it('narrows asResult NOT_FOUND data and protocol VALIDATION issues', () => {
    async function check() {
      const result = await asResult(client.planet.find({ id: 1 }))
      if (!result.ok && result.error.code === 'NOT_FOUND') {
        expectTypeOf(result.error.data).toEqualTypeOf<{ id: number }>()
      }
      if (!result.ok && result.error.code === 'VALIDATION') {
        expectTypeOf(result.error.data.issues).toEqualTypeOf<
          { message: string; path: Array<string | number> }[]
        >()
      }
    }
    expectTypeOf(check).toBeFunction()
  })

  it('types stream output as AsyncIterable', () => {
    expectTypeOf(client.planet.chat).returns.resolves.toEqualTypeOf<
      AsyncIterable<{ token: string }>
    >()
  })
})
