import { Type } from '@sinclair/typebox'
import { createClient, FetchLink } from '@ts-pf/client'
import { procedure, router } from '@ts-pf/contract'
import { createImplementer, FetchHandler } from '@ts-pf/server'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
    create: procedure
      .input(Type.Object({ name: Type.String() }))
      .output(Type.Object({ id: Type.Number(), name: Type.String() })),
  },
})

const impl = createImplementer(contract)
const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input }) => ({
      id: input.id,
      name: 'Earth',
    })),
    create: impl.planet.create.handler(async ({ input }) => ({
      id: 3,
      name: input.name,
    })),
  },
})

const handler = new FetchHandler(app)
const fetchImpl: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init)
  const result = await handler.handle(req, { prefix: '/rpc', context: {} })
  if (!result.matched) {
    return new Response('not found', { status: 404 })
  }
  return result.response
}

describe('e2e Zod + TypeBox', () => {
  const client = createClient<typeof contract>(
    new FetchLink({ url: 'http://localhost/rpc', fetch: fetchImpl }),
  )

  it('roundtrips both schema libraries', async () => {
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
    expect(await client.planet.create({ name: 'Mars' })).toEqual({
      id: 3,
      name: 'Mars',
    })
  })

  it('types the client from the contract', () => {
    expectTypeOf(client.planet.find)
      .parameter(0)
      .toEqualTypeOf<{ id: number }>()
    expectTypeOf(client.planet.create)
      .parameter(0)
      .toEqualTypeOf<{ name: string }>()
  })
})
