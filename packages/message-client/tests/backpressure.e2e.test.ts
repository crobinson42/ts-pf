// End-to-end slow-peer protection over createMemoryDuplex({ highWaterMark }):
// a stalled consumer fills its receive queue, the link pauses the duplex, the
// sender's frames back up past the mark, its producer pauses, and the drain
// timeout aborts the call while the connection stays usable.
import { createClient, isLocalFailure } from '@ts-pf/client'
import { procedure, router } from '@ts-pf/contract'
import { createMemoryDuplex, type StallInfo } from '@ts-pf/message'
import { DuplexHandler } from '@ts-pf/message-server'
import { createImplementer } from '@ts-pf/server'
import { stream } from '@ts-pf/stream'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DuplexLink, WsLink } from '../src/index.js'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
    chat: procedure.output(stream(z.object({ token: z.string() }))),
    ingest: procedure
      .input(stream(z.object({ chunk: z.string() })))
      .output(z.object({ count: z.number() })),
  },
})
const impl = createImplementer(contract)

const HIGH_WATER_MARK = 200
const DRAIN_TIMEOUT = 100
const PAD = 'x'.repeat(50)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitUntil(pred: () => boolean): Promise<void> {
  const started = Date.now()
  while (!pred()) {
    if (Date.now() - started > 3000) {
      throw new Error('timed out waiting for condition')
    }
    await sleep(1)
  }
}

function openPair() {
  const probe = {
    produced: 0,
    finallyRuns: 0,
    ingested: 0,
    ingestAborted: false,
    releaseIngest: () => {},
  }
  const ingestGate = new Promise<void>((resolve) => {
    probe.releaseIngest = resolve
  })
  const app = impl.router({
    planet: {
      find: impl.planet.find.handler(async ({ input }) => ({
        id: input.id,
        name: 'Earth',
      })),
      chat: impl.planet.chat.handler(async function* () {
        try {
          for (let i = 0; i < 1000; i++) {
            probe.produced += 1
            yield { token: PAD }
          }
        } finally {
          probe.finallyRuns += 1
        }
      }),
      ingest: impl.planet.ingest.handler(async ({ input, signal }) => {
        signal?.addEventListener('abort', () => {
          probe.ingestAborted = true
        })
        for await (const _item of input) {
          probe.ingested += 1
          if (probe.ingested === 1) {
            await ingestGate
          }
        }
        return { count: probe.ingested }
      }),
    },
  })
  const serverStalls: StallInfo[] = []
  const clientStalls: StallInfo[] = []
  const { a, b } = createMemoryDuplex({ highWaterMark: HIGH_WATER_MARK })
  const bind = new DuplexHandler(app, {
    backpressure: {
      highWaterMark: HIGH_WATER_MARK,
      drainTimeout: DRAIN_TIMEOUT,
      onStall: (info) => {
        serverStalls.push(info)
      },
    },
  }).bind(a, { context: {} })
  const link = new DuplexLink({
    duplex: b,
    backpressure: {
      highWaterMark: HIGH_WATER_MARK,
      drainTimeout: DRAIN_TIMEOUT,
      onStall: (info) => {
        clientStalls.push(info)
      },
    },
  })
  const client = createClient<typeof contract>(link)
  return { bind, client, link, probe, serverStalls, clientStalls }
}

describe('output stream to a stalled consumer', () => {
  it('pauses the server generator, aborts after drainTimeout with INTERNAL, and keeps the connection usable', async () => {
    const { bind, client, link, probe, serverStalls, clientStalls } = openPair()

    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let consumed = 0
    let streamError: unknown
    const consuming = (async () => {
      try {
        for await (const _token of await client.planet.chat()) {
          consumed += 1
          if (consumed === 1) {
            await gate
          }
        }
      } catch (error) {
        streamError = error
      }
    })()

    // (a) the producer stops once the client queue, then the duplex, are over the mark
    await waitUntil(() => serverStalls.length === 1)
    const parkedAt = probe.produced
    await sleep(20)
    expect(probe.produced).toBe(parkedAt)
    expect(parkedAt).toBeLessThan(20)
    expect(consumed).toBe(1)

    // (b) one 'paused' stall on the server names the call; the client logged nothing
    expect(serverStalls).toEqual([
      { path: ['planet', 'chat'], id: '1', waitedMs: 0, action: 'paused' },
    ])
    expect(clientStalls).toEqual([])

    // (d) a healthy unary call is accepted while the stream is stalled
    const healthy = client.planet.find({ id: 1 })

    // (c) the drain timeout aborts the call: generator finalised exactly once
    await waitUntil(() => serverStalls.length === 2)
    expect(serverStalls[1]).toMatchObject({
      path: ['planet', 'chat'],
      id: '1',
      action: 'aborted',
    })
    await waitUntil(() => probe.finallyRuns === 1)
    expect(probe.produced).toBe(parkedAt)

    // the consumer wakes up: every produced item arrives, then the terminal error
    release()
    await consuming
    expect(consumed).toBe(parkedAt)
    expect(streamError).toMatchObject({
      code: 'INTERNAL',
      message: `Peer did not drain within ${DRAIN_TIMEOUT} ms`,
    })
    expect(isLocalFailure(streamError as never)).toBe(false)
    expect(await healthy).toEqual({ id: 1, name: 'Earth' })
    expect(await client.planet.find({ id: 2 })).toEqual({
      id: 2,
      name: 'Earth',
    })
    expect(probe.finallyRuns).toBe(1)

    link.close()
    bind.close()
  })
})

describe('input stream to a stalled server handler', () => {
  it('pauses the client pump, fails the call locally after drainTimeout, cancels, and returns the input iterator once', async () => {
    const { bind, client, link, probe, serverStalls, clientStalls } = openPair()

    let pulled = 0
    let inputFinally = 0
    async function* chunks() {
      try {
        for (let i = 0; i < 1000; i++) {
          pulled += 1
          yield { chunk: PAD }
        }
      } finally {
        inputFinally += 1
      }
    }

    const call = client.planet.ingest(chunks())
    const outcome = call.then(
      () => {
        throw new Error('should reject')
      },
      (error: unknown) => error,
    )

    // the pump parks once the server queue, then the duplex, are over the mark
    await waitUntil(() => clientStalls.length === 1)
    const parkedAt = pulled
    await sleep(20)
    expect(pulled).toBe(parkedAt)
    expect(parkedAt).toBeLessThan(20)
    expect(probe.ingested).toBe(1)
    expect(clientStalls).toEqual([
      { path: ['planet', 'ingest'], id: '1', waitedMs: 0, action: 'paused' },
    ])
    expect(serverStalls).toEqual([])

    await waitUntil(() => clientStalls.length === 2)
    expect(clientStalls[1]).toMatchObject({
      path: ['planet', 'ingest'],
      id: '1',
      action: 'aborted',
    })
    const error = await outcome
    expect(isLocalFailure(error as never)).toBe(true)
    expect(error).toMatchObject({
      code: 'INTERNAL',
      message: `Peer did not drain within ${DRAIN_TIMEOUT} ms`,
    })
    await waitUntil(() => inputFinally === 1)
    expect(pulled).toBe(parkedAt)

    // the server handler wakes up, drains its queue, and then sees the cancel
    probe.releaseIngest()
    await waitUntil(() => probe.ingestAborted)
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })

    link.close()
    bind.close()
  })
})

describe('LinkOptions.backpressure validation', () => {
  it('throws a TypeError naming the option at construction', () => {
    const { b } = createMemoryDuplex()
    expect(
      () => new DuplexLink({ duplex: b, backpressure: { drainTimeout: -5 } }),
    ).toThrow(/backpressure\.drainTimeout/)
    expect(
      () =>
        new DuplexLink({
          duplex: b,
          backpressure: { highWaterMark: Number.NaN },
        }),
    ).toThrow(/backpressure\.highWaterMark/)
    const socket = {
      readyState: 0,
      send() {},
      close() {},
      addEventListener() {},
      removeEventListener() {},
    }
    expect(
      () =>
        new WsLink({
          socket,
          backpressure: { onStall: 'log' as unknown as false },
        }),
    ).toThrow(/backpressure\.onStall/)
  })
})
