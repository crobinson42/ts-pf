import { asResult, createClient, isLocalFailure } from '@ts-pf/client'
import { procedure, router } from '@ts-pf/contract'
import { PortHandler } from '@ts-pf/message-server'
import { createImplementer } from '@ts-pf/server'
import Type from 'typebox'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { PortLink } from '../src/index.js'

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

describe('MessageChannel e2e', () => {
  it('roundtrips planet.find and planet.create over PortHandler + PortLink', async () => {
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
    const { port1, port2 } = new MessageChannel()
    const bind = new PortHandler(app).bind(port1, { context: {} })
    const link = new PortLink({ port: port2 })
    const client = createClient<typeof contract>(link)

    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
    expect(await client.planet.create({ name: 'Mars' })).toEqual({
      id: 3,
      name: 'Mars',
    })

    expectTypeOf(client.planet.find)
      .parameter(0)
      .toEqualTypeOf<{ id: number }>()
    expectTypeOf(client.planet.create)
      .parameter(0)
      .toEqualTypeOf<{ name: string }>()

    link.close()
    bind.close()
  })

  it('asResult + isLocalFailure after link.close on in-flight and subsequent calls', async () => {
    let resolveStarted!: () => void
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    const app = impl.router({
      planet: {
        find: impl.planet.find.handler(async ({ input, signal }) => {
          resolveStarted()
          await new Promise<void>((resolve) => {
            if (signal?.aborted) {
              resolve()
              return
            }
            signal?.addEventListener('abort', () => {
              resolve()
            })
          })
          return { id: input.id, name: 'Earth' }
        }),
        create: impl.planet.create.handler(async ({ input }) => ({
          id: 3,
          name: input.name,
        })),
      },
    })
    const { port1, port2 } = new MessageChannel()
    const bind = new PortHandler(app).bind(port1, { context: {} })
    const link = new PortLink({ port: port2 })
    const client = createClient<typeof contract>(link)

    const pending = asResult(client.planet.find({ id: 1 }))
    await started
    link.close()

    const inflight = await pending
    expect(inflight.ok).toBe(false)
    if (!inflight.ok) {
      expect(isLocalFailure(inflight.error)).toBe(true)
      expect(inflight.error.message).toBe('Connection closed')
    }

    const later = await asResult(client.planet.find({ id: 1 }))
    expect(later.ok).toBe(false)
    if (!later.ok) {
      expect(isLocalFailure(later.error)).toBe(true)
      expect(later.error.message).toBe('Connection closed')
    }

    bind.close()
  })
})
