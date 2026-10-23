// DuplexHandler + DuplexLink over createMemoryDuplex: the "bring your own
// duplex" path a third-party pipe (Electron IPC, Chrome runtime port,
// WebTransport) takes, with no port / socket / stdio adapter involved.
import { asResult, createClient, isLocalFailure } from '@ts-pf/client'
import { procedure, router } from '@ts-pf/contract'
import { createMemoryDuplex } from '@ts-pf/message'
import { DuplexHandler } from '@ts-pf/message-server'
import { createImplementer } from '@ts-pf/server'
import { stream } from '@ts-pf/stream'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DuplexLink } from '../src/index.js'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
    chat: procedure
      .input(z.object({ prompt: z.string() }))
      .output(stream(z.object({ token: z.string() }))),
  },
})

type AppCtx = { planets: Map<number, string> }

const impl = createImplementer(contract).$context<AppCtx>()

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function waitUntil(pred: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (pred()) {
      return
    }
    await nextTurn()
  }
  throw new Error('timed out waiting for condition')
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const item of items) {
    out.push(item)
  }
  return out
}

/** Counts how many times the chat generator's finally block ran. */
let finallyRuns = 0

function openApp(onAbort?: () => void) {
  const app = impl.router({
    planet: {
      find: impl.planet.find.handler(async ({ input, context, errors }) => {
        const name = context.planets.get(input.id)
        if (name === undefined) {
          throw errors.NOT_FOUND({ id: input.id })
        }
        return { id: input.id, name }
      }),
      chat: impl.planet.chat.handler(async function* ({ input, signal }) {
        try {
          yield { token: input.prompt.slice(0, 1) }
          yield { token: input.prompt.slice(1) }
          if (onAbort === undefined) {
            return
          }
          await new Promise<void>((resolve) => {
            const done = () => {
              onAbort()
              resolve()
            }
            if (signal?.aborted) {
              done()
              return
            }
            signal?.addEventListener('abort', done)
          })
          yield { token: 'late' }
        } finally {
          finallyRuns += 1
        }
      }),
    },
  })
  const { a, b } = createMemoryDuplex()
  const bind = new DuplexHandler(app).bind(a, {
    context: { planets: new Map([[1, 'Earth']]) },
  })
  const link = new DuplexLink({ duplex: b })
  const client = createClient<typeof contract>(link)
  return { bind, client, link }
}

describe('DuplexHandler + DuplexLink over createMemoryDuplex', () => {
  it('roundtrips a unary call with the bound context', async () => {
    const { bind, client, link } = openApp()

    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })

    link.close()
    bind.close()
  })

  it('surfaces a declared error with its data (not a local failure)', async () => {
    const { bind, client, link } = openApp()

    const result = await asResult(client.planet.find({ id: 2 }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND')
      expect(result.error.data).toEqual({ id: 2 })
      expect(result.error.status).toBeUndefined()
      expect(isLocalFailure(result.error)).toBe(false)
    }

    link.close()
    bind.close()
  })

  it('resolves an output stream to an async iterable', async () => {
    const { bind, client, link } = openApp()

    const tokens = await client.planet.chat({ prompt: 'Hi' })
    expect(await collect(tokens)).toEqual([{ token: 'H' }, { token: 'i' }])

    link.close()
    bind.close()
  })

  it('cancels the server handler when the client breaks out of the stream', async () => {
    let aborted = false
    finallyRuns = 0
    const { bind, client, link } = openApp(() => {
      aborted = true
    })

    const seen: { token: string }[] = []
    for await (const item of await client.planet.chat({ prompt: 'Hi' })) {
      seen.push(item)
      if (seen.length === 2) {
        break
      }
    }
    expect(seen).toEqual([{ token: 'H' }, { token: 'i' }])
    await waitUntil(() => aborted)
    await waitUntil(() => finallyRuns === 1)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(finallyRuns).toBe(1)

    link.close()
    bind.close()
  })

  it('fails in-flight and later calls locally after link.close()', async () => {
    const { bind, client, link } = openApp(() => {})

    const pending = asResult(client.planet.chat({ prompt: 'Hi' }))
    await nextTurn()
    link.close()
    const later = await asResult(client.planet.find({ id: 1 }))
    expect(later.ok).toBe(false)
    if (!later.ok) {
      expect(isLocalFailure(later.error)).toBe(true)
      expect(later.error.message).toBe('Connection closed')
    }
    // the stream already resolved; its iterator ends with the connection
    const first = await pending
    expect(first.ok).toBe(true)
    if (first.ok) {
      await expect(collect(first.data)).rejects.toMatchObject({
        message: 'Connection closed',
      })
    }

    bind.close()
    bind.close() // idempotent
  })
})
