import { procedure, router } from '@ts-pf/contract'
import { createImplementer, createLocalClient } from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createSwr } from '../src/create-swr.js'

const contract = router({
  planet: {
    list: procedure.output(
      z.array(z.object({ id: z.number(), name: z.string() })),
    ),
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
    create: procedure
      .input(z.object({ name: z.string() }))
      .output(z.object({ id: z.number(), name: z.string() })),
  },
})

const impl = createImplementer(contract)
const app = impl.router({
  planet: {
    list: impl.planet.list.handler(async () => [
      { id: 1, name: 'Earth' },
      { id: 2, name: 'Mars' },
    ]),
    find: impl.planet.find.handler(async ({ input }) => {
      if (input.id === 1) {
        return { id: 1, name: 'Earth' }
      }
      throw new Error('missing')
    }),
    create: impl.planet.create.handler(async ({ input }) => ({
      id: 3,
      name: input.name,
    })),
  },
})

describe('createSwr', () => {
  const client = createLocalClient(app, { context: {} })
  const swr = createSwr(client)

  it('builds keys that mirror the procedure path', () => {
    expect(swr.planet.list.key()).toEqual([['planet', 'list'], {}])
    expect(swr.planet.find.key({ input: { id: 1 } })).toEqual([
      ['planet', 'find'],
      { input: { id: 1 } },
    ])
  })

  it('namespaces keys with prefix', () => {
    const prefixed = createSwr(client, { prefix: 'user' })
    expect(prefixed.planet.find.key({ input: { id: 1 } })).toEqual([
      'user',
      ['planet', 'find'],
      { input: { id: 1 } },
    ])
    expect(prefixed.matcher()(swr.planet.list.key())).toBe(false)
    expect(prefixed.matcher()(prefixed.planet.list.key())).toBe(true)
  })

  it('calls through the procedure client', async () => {
    await expect(swr.planet.find({ id: 1 })).resolves.toEqual({
      id: 1,
      name: 'Earth',
    })
    await expect(swr.planet.find.call({ id: 1 })).resolves.toEqual({
      id: 1,
      name: 'Earth',
    })
    await expect(swr.planet.list()).resolves.toEqual([
      { id: 1, name: 'Earth' },
      { id: 2, name: 'Mars' },
    ])
  })

  it('fetches using input from the key', async () => {
    await expect(
      swr.planet.find.fetcher()(swr.planet.find.key({ input: { id: 1 } })),
    ).resolves.toEqual({ id: 1, name: 'Earth' })
  })

  it('mutates with the trigger argument', async () => {
    await expect(
      swr.planet.create.mutator()(swr.planet.list.key(), {
        arg: { name: 'Venus' },
      }),
    ).resolves.toEqual({ id: 3, name: 'Venus' })
  })

  it('matches nested keys from a router matcher', () => {
    expect(
      swr.planet.matcher()(swr.planet.find.key({ input: { id: 1 } })),
    ).toBe(true)
    expect(swr.planet.matcher()(swr.planet.list.key())).toBe(true)
    expect(swr.matcher()(swr.planet.list.key())).toBe(true)
  })

  it('skips then so namespaces are not thenable', async () => {
    expect(swr.planet).not.toHaveProperty('then')
    await expect(Promise.resolve(swr.planet)).resolves.toBe(swr.planet)
  })
})
