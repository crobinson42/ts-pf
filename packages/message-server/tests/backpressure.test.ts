// Slow-peer protection on the server side, driven by a scripted Duplex whose
// `send` returns a drain promise for `item` frames only, so the test is the
// slow transport and every other frame (unary results) goes out instantly.
import { procedure, router } from '@ts-pf/contract'
import {
  type Duplex,
  decodeFrame,
  encodeFrame,
  type MessageFrame,
  type StallInfo,
} from '@ts-pf/message'
import { createImplementer } from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DuplexHandler, PortHandler } from '../src/index.js'
import { attachRouter } from '../src/shared.js'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitUntil(pred: () => boolean): Promise<void> {
  const started = Date.now()
  while (!pred()) {
    if (Date.now() - started > 2000) {
      throw new Error('timed out waiting for condition')
    }
    await sleep(1)
  }
}

type Scripted = {
  duplex: Duplex
  /** Every frame the handler sent, decoded. */
  frames: MessageFrame[]
  /** Resolvers of the drain promises handed out for `item` frames. */
  drains: (() => void)[]
  /** While true, `item` frames return a drain promise. */
  slow: { items: boolean }
  pauseCalls: number[]
  deliver(frame: MessageFrame): void
}

function scriptedDuplex(): Scripted {
  const messageHandlers = new Set<(text: string) => void>()
  const closeHandlers = new Set<(reason?: unknown) => void>()
  const frames: MessageFrame[] = []
  const drains: (() => void)[] = []
  const slow = { items: true }
  const pauseCalls: number[] = []
  let closed = false
  const scripted: Scripted = {
    frames,
    drains,
    slow,
    pauseCalls,
    deliver(frame) {
      const text = encodeFrame(frame)
      queueMicrotask(() => {
        for (const handler of [...messageHandlers]) {
          handler(text)
        }
      })
    },
    duplex: {
      send(text) {
        if (closed) {
          return undefined
        }
        const decoded = decodeFrame(text)
        if (!decoded.ok) {
          return undefined
        }
        frames.push(decoded.frame)
        if (slow.items && decoded.frame.type === 'item') {
          return new Promise<void>((resolve) => {
            drains.push(resolve)
          })
        }
        return undefined
      },
      onMessage(handler) {
        messageHandlers.add(handler)
        return () => {
          messageHandlers.delete(handler)
        }
      },
      onClose(handler) {
        closeHandlers.add(handler)
        return () => {
          closeHandlers.delete(handler)
        }
      },
      close(reason) {
        if (closed) {
          return
        }
        closed = true
        for (const resolve of drains.splice(0)) {
          resolve()
        }
        for (const handler of [...closeHandlers]) {
          handler(reason)
        }
      },
      pause() {
        pauseCalls.push(1)
      },
      resume() {
        pauseCalls.push(-1)
      },
    },
  }
  return scripted
}

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
    chat: procedure,
    ingest: procedure.output(z.object({ count: z.number() })),
  },
})
const impl = createImplementer(contract)

type Probe = {
  produced: number
  finallyRuns: number
  aborted: boolean
  consumed: number
  releaseIngest: () => void
}

function openApp(options: {
  drainTimeout: number
  highWaterMark?: number
  onStall: (info: StallInfo) => void
  onError?: (error: unknown) => void
}) {
  const probe: Probe = {
    produced: 0,
    finallyRuns: 0,
    aborted: false,
    consumed: 0,
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
      chat: impl.planet.chat.handler(async function* ({ signal }) {
        signal?.addEventListener('abort', () => {
          probe.aborted = true
        })
        try {
          for (let i = 0; i < 1000; i++) {
            probe.produced += 1
            yield { i }
          }
        } finally {
          probe.finallyRuns += 1
        }
      }),
      ingest: impl.planet.ingest.handler(async ({ input }) => {
        for await (const _item of input as unknown as AsyncIterable<unknown>) {
          probe.consumed += 1
          if (probe.consumed === 1) {
            await ingestGate
          }
        }
        return { count: probe.consumed }
      }),
    },
  })
  const scripted = scriptedDuplex()
  const server = attachRouter({
    duplex: scripted.duplex,
    router: app,
    context: {},
    ...(options.onError !== undefined ? { onError: options.onError } : {}),
    backpressure: {
      drainTimeout: options.drainTimeout,
      onStall: options.onStall,
      ...(options.highWaterMark !== undefined
        ? { highWaterMark: options.highWaterMark }
        : {}),
    },
  })
  return { probe, scripted, server }
}

async function handshake(scripted: Scripted, ready: Promise<void>) {
  scripted.deliver({ type: 'hello', v: 1 })
  await ready
  expect(scripted.frames).toEqual([{ type: 'hello-ok', v: 1 }])
  scripted.frames.length = 0
}

const resultsFor = (frames: MessageFrame[], id: string) =>
  frames.filter((frame) => frame.type === 'result' && frame.id === id)

describe('server output stream backpressure', () => {
  it('pauses the generator while the duplex drains, warns once, then aborts on drainTimeout with INTERNAL and no onError', async () => {
    const stalls: StallInfo[] = []
    const errors: unknown[] = []
    const { probe, scripted, server } = openApp({
      drainTimeout: 60,
      onStall: (info) => {
        stalls.push(info)
      },
      onError: (error) => {
        errors.push(error)
      },
    })
    await handshake(scripted, server.ready)

    scripted.deliver({ type: 'call', id: '1', path: ['planet', 'chat'] })
    await waitUntil(() => scripted.drains.length === 1)

    // (a) the producer is parked at its yield: one item out, one drain pending
    expect(probe.produced).toBe(1)
    await sleep(10)
    expect(probe.produced).toBe(1)
    expect(scripted.frames.filter((frame) => frame.type === 'item')).toEqual([
      { type: 'item', id: '1', output: { i: 0 } },
    ])

    // (b) one 'paused' stall naming the call
    expect(stalls).toEqual([
      { path: ['planet', 'chat'], id: '1', waitedMs: 0, action: 'paused' },
    ])

    // (d) a healthy unary call on the same duplex completes while the stream is stalled
    scripted.deliver({
      type: 'call',
      id: '2',
      path: ['planet', 'find'],
      input: { id: 1 },
    })
    await waitUntil(() => resultsFor(scripted.frames, '2').length === 1)
    expect(resultsFor(scripted.frames, '2')).toEqual([
      { type: 'result', id: '2', ok: true, output: { id: 1, name: 'Earth' } },
    ])
    expect(probe.produced).toBe(1)

    // (c) the drain timeout aborts the call
    await waitUntil(() => stalls.length === 2)
    expect(stalls[1]).toMatchObject({
      path: ['planet', 'chat'],
      id: '1',
      action: 'aborted',
    })
    expect(stalls[1]?.waitedMs).toBeGreaterThanOrEqual(50)
    await waitUntil(() => probe.finallyRuns === 1)
    expect(probe.aborted).toBe(true)
    expect(resultsFor(scripted.frames, '1')).toEqual([
      {
        type: 'result',
        id: '1',
        ok: false,
        error: { code: 'INTERNAL', message: 'Peer did not drain within 60 ms' },
      },
    ])
    expect(errors).toEqual([])

    // the connection stays open: late drain, no more frames for id 1, new calls still work
    for (const resolve of scripted.drains.splice(0)) {
      resolve()
    }
    await sleep(10)
    expect(probe.produced).toBe(1)
    expect(probe.finallyRuns).toBe(1)
    expect(
      scripted.frames.filter((frame) => 'id' in frame && frame.id === '1'),
    ).toHaveLength(2)
    scripted.deliver({
      type: 'call',
      id: '3',
      path: ['planet', 'find'],
      input: { id: 3 },
    })
    await waitUntil(() => resultsFor(scripted.frames, '3').length === 1)
    server.close()
  })

  it('drainTimeout: 0 pauses without aborting and resumes when the duplex drains', async () => {
    const stalls: StallInfo[] = []
    const { probe, scripted, server } = openApp({
      drainTimeout: 0,
      onStall: (info) => {
        stalls.push(info)
      },
    })
    await handshake(scripted, server.ready)

    scripted.deliver({ type: 'call', id: '1', path: ['planet', 'chat'] })
    await waitUntil(() => scripted.drains.length === 1)
    await sleep(40)
    expect(probe.produced).toBe(1)
    expect(probe.finallyRuns).toBe(0)
    expect(resultsFor(scripted.frames, '1')).toEqual([])
    expect(stalls.map((info) => info.action)).toEqual(['paused'])

    // a fast peer again: let every item through
    scripted.slow.items = false
    for (const resolve of scripted.drains.splice(0)) {
      resolve()
    }
    await waitUntil(() =>
      scripted.frames.some((frame) => frame.type === 'done'),
    )
    expect(probe.produced).toBe(1000)
    expect(probe.finallyRuns).toBe(1)
    expect(stalls.map((info) => info.action)).toEqual(['paused'])
    server.close()
  })

  it('cancel while paused returns the generator once and sends nothing more', async () => {
    const { probe, scripted, server } = openApp({
      drainTimeout: 0,
      onStall: () => {},
    })
    await handshake(scripted, server.ready)

    scripted.deliver({ type: 'call', id: '1', path: ['planet', 'chat'] })
    await waitUntil(() => scripted.drains.length === 1)
    scripted.deliver({ type: 'cancel', id: '1' })
    await waitUntil(() => probe.finallyRuns === 1)
    expect(probe.aborted).toBe(true)

    for (const resolve of scripted.drains.splice(0)) {
      resolve()
    }
    await sleep(10)
    expect(probe.produced).toBe(1)
    expect(
      scripted.frames.filter((frame) => 'id' in frame && frame.id === '1'),
    ).toEqual([{ type: 'item', id: '1', output: { i: 0 } }])
    server.close()
  })

  it('connection close while paused settles the drain and returns the generator', async () => {
    const { probe, scripted, server } = openApp({
      drainTimeout: 0,
      onStall: () => {},
    })
    await handshake(scripted, server.ready)
    scripted.deliver({ type: 'call', id: '1', path: ['planet', 'chat'] })
    await waitUntil(() => scripted.drains.length === 1)

    server.close()
    await waitUntil(() => probe.finallyRuns === 1)
    expect(probe.produced).toBe(1)
  })
})

describe('server input stream backpressure', () => {
  it('pauses the duplex when a call input queue passes highWaterMark and resumes at half', async () => {
    const { probe, scripted, server } = openApp({
      drainTimeout: 0,
      highWaterMark: 100,
      onStall: () => {},
    })
    await handshake(scripted, server.ready)

    scripted.deliver({
      type: 'call',
      id: '1',
      path: ['planet', 'ingest'],
      stream: true,
    })
    const item = { chunk: 'x'.repeat(30) } // ~75 chars per in-item frame
    scripted.deliver({ type: 'in-item', id: '1', input: item }) // handed to the handler
    await waitUntil(() => probe.consumed === 1)
    scripted.deliver({ type: 'in-item', id: '1', input: item }) // 75 buffered
    await sleep(5)
    expect(scripted.pauseCalls).toEqual([])
    scripted.deliver({ type: 'in-item', id: '1', input: item }) // 150 > 100
    await waitUntil(() => scripted.pauseCalls.length === 1)
    expect(scripted.pauseCalls).toEqual([1])

    probe.releaseIngest()
    await waitUntil(() => probe.consumed === 3) // drained to 0 <= 50
    expect(scripted.pauseCalls).toEqual([1, -1])
    scripted.deliver({ type: 'in-done', id: '1' })
    await waitUntil(() => resultsFor(scripted.frames, '1').length === 1)
    expect(resultsFor(scripted.frames, '1')).toEqual([
      { type: 'result', id: '1', ok: true, output: { count: 3 } },
    ])
    server.close()
  })

  it('highWaterMark: Infinity never pauses', async () => {
    const { probe, scripted, server } = openApp({
      drainTimeout: 0,
      highWaterMark: Infinity,
      onStall: () => {},
    })
    await handshake(scripted, server.ready)
    scripted.deliver({
      type: 'call',
      id: '1',
      path: ['planet', 'ingest'],
      stream: true,
    })
    for (let i = 0; i < 50; i++) {
      scripted.deliver({
        type: 'in-item',
        id: '1',
        input: { chunk: 'x'.repeat(200) },
      })
    }
    await waitUntil(() => probe.consumed === 1)
    await sleep(5)
    expect(scripted.pauseCalls).toEqual([])
    probe.releaseIngest()
    server.close()
  })
})

describe('a throwing onStall is observability only', () => {
  it("a throw on 'aborted' still aborts the call with INTERNAL and never reaches onError", async () => {
    const errors: unknown[] = []
    const uncaught: unknown[] = []
    const onUncaught = (error: unknown): void => {
      uncaught.push(error)
    }
    process.on('uncaughtException', onUncaught)
    try {
      const { probe, scripted, server } = openApp({
        drainTimeout: 40,
        onStall: () => {
          throw new Error('logger exploded')
        },
        onError: (error) => {
          errors.push(error)
        },
      })
      await handshake(scripted, server.ready)
      scripted.deliver({ type: 'call', id: '1', path: ['planet', 'chat'] })
      await waitUntil(() => resultsFor(scripted.frames, '1').length === 1)
      expect(resultsFor(scripted.frames, '1')).toEqual([
        {
          type: 'result',
          id: '1',
          ok: false,
          error: {
            code: 'INTERNAL',
            message: 'Peer did not drain within 40 ms',
          },
        },
      ])
      await waitUntil(() => probe.finallyRuns === 1)
      expect(probe.produced).toBe(1)
      expect(errors).toEqual([])
      await sleep(5)
      expect(uncaught).toEqual([])
      server.close()
    } finally {
      process.off('uncaughtException', onUncaught)
    }
  })

  it("a throw on 'paused' does not fail the stream or reach onError", async () => {
    const errors: unknown[] = []
    const { probe, scripted, server } = openApp({
      drainTimeout: 0,
      onStall: () => {
        throw new Error('paused logger exploded')
      },
      onError: (error) => {
        errors.push(error)
      },
    })
    await handshake(scripted, server.ready)
    scripted.deliver({ type: 'call', id: '1', path: ['planet', 'chat'] })
    await waitUntil(() => scripted.drains.length === 1)
    expect(resultsFor(scripted.frames, '1')).toEqual([])

    scripted.slow.items = false
    for (const resolve of scripted.drains.splice(0)) {
      resolve()
    }
    await waitUntil(() =>
      scripted.frames.some((frame) => frame.type === 'done'),
    )
    expect(probe.produced).toBe(1000)
    expect(probe.finallyRuns).toBe(1)
    expect(resultsFor(scripted.frames, '1')).toEqual([])
    expect(errors).toEqual([])
    server.close()
  })
})

describe('HandlerOptions.backpressure validation', () => {
  const app = impl.router({
    planet: {
      find: impl.planet.find.handler(async ({ input }) => ({
        id: input.id,
        name: 'Earth',
      })),
      chat: impl.planet.chat.handler(async function* () {}),
      ingest: impl.planet.ingest.handler(async () => ({ count: 0 })),
    },
  })

  it('throws a TypeError naming the option at construction', () => {
    expect(
      () => new DuplexHandler(app, { backpressure: { highWaterMark: -1 } }),
    ).toThrow(/backpressure\.highWaterMark/)
    expect(
      () =>
        new DuplexHandler(app, { backpressure: { drainTimeout: Number.NaN } }),
    ).toThrow(/backpressure\.drainTimeout/)
    expect(
      () =>
        new PortHandler(app, {
          backpressure: { onStall: 'warn' as unknown as false },
        }),
    ).toThrow(TypeError)
  })

  it('accepts the documented edge values', () => {
    expect(
      () =>
        new DuplexHandler(app, {
          backpressure: {
            highWaterMark: Infinity,
            drainTimeout: 0,
            onStall: false,
          },
        }),
    ).not.toThrow()
    expect(() => new DuplexHandler(app)).not.toThrow()
  })
})
