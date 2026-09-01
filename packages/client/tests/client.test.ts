import { oc } from '@ts-pf/contract'
import { isPFError } from '@ts-pf/protocol'
import { implement, RPCHandler } from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createClient, FetchLink, safe } from '@ts-pf/client'

const contract = oc.router({
  planet: {
    list: oc.output(z.array(z.object({ id: z.number(), name: z.string() }))),
    find: oc
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({ NOT_FOUND: { status: 404 } }),
  },
})

const os = implement(contract)
const router = os.router({
  planet: {
    list: os.planet.list.handler(async () => [{ id: 1, name: 'Earth' }]),
    find: os.planet.find.handler(async ({ input, errors }) => {
      if (input.id < 0) {
        throw errors.NOT_FOUND()
      }
      return { id: input.id, name: 'Earth' }
    }),
  },
})

const handler = new RPCHandler(router)

const fetchImpl: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init)
  const result = await handler.handle(req, { prefix: '/rpc', context: {} })
  if (!result.matched) {
    return new Response('not found', { status: 404 })
  }
  return result.response
}

describe('createClient', () => {
  const client = createClient<typeof contract>(
    new FetchLink({ url: 'http://localhost/rpc', fetch: fetchImpl }),
  )

  it('calls a procedure over Fetch', async () => {
    expect(await client.planet.find({ id: 1 })).toEqual({ id: 1, name: 'Earth' })
  })

  it('calls a no-input procedure', async () => {
    expect(await client.planet.list()).toEqual([{ id: 1, name: 'Earth' }])
  })

  it('rejects with PFError', async () => {
    await expect(client.planet.find({ id: -1 })).rejects.toSatisfy(isPFError)
  })

  it('safe() returns a result union', async () => {
    const result = await safe(client.planet.find({ id: -1 }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND')
    }
  })

  it('adds interceptor headers', async () => {
    const seen: string[] = []
    const clientWithHeader = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc/',
        fetch: async (input, init) => {
          const req = input instanceof Request ? input : new Request(input, init)
          seen.push(req.headers.get('x-test') ?? '')
          return fetchImpl(req)
        },
        interceptors: [
          async ({ next, request }) => {
            request.headers.set('x-test', '1')
            return next(request)
          },
        ],
      }),
    )
    await clientWithHeader.planet.list()
    expect(seen).toEqual(['1'])
  })
})
