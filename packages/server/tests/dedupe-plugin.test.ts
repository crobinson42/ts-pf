import { procedure, router } from '@ts-pf/contract'
import {
  createImplementer,
  createLocalClient,
  DedupePlugin,
} from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  ping: procedure.output(z.string()),
  echo: procedure
    .input(z.object({ n: z.number() }))
    .output(z.object({ n: z.number() })),
})

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (predicate()) {
      return
    }
    await Promise.resolve()
  }
  throw new Error('timed out')
}

describe('DedupePlugin', () => {
  it('coalesces two concurrent identical calls into one handler run', async () => {
    let started = 0
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => {
        started++
        await gate
        return input
      }),
    })
    const client = createLocalClient(app, {
      context: {},
      plugins: [new DedupePlugin()],
    })
    const p1 = client.echo({ n: 1 })
    const p2 = client.echo({ n: 1 })
    await waitUntil(() => started === 1)
    expect(started).toBe(1)
    release()
    await expect(p1).resolves.toEqual({ n: 1 })
    await expect(p2).resolves.toEqual({ n: 1 })
    expect(started).toBe(1)
  })

  it('does not share calls with different inputs', async () => {
    let started = 0
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => {
        started++
        await gate
        return input
      }),
    })
    const client = createLocalClient(app, {
      context: {},
      plugins: [new DedupePlugin()],
    })
    const p1 = client.echo({ n: 1 })
    const p2 = client.echo({ n: 2 })
    await waitUntil(() => started === 2)
    expect(started).toBe(2)
    release()
    await expect(p1).resolves.toEqual({ n: 1 })
    await expect(p2).resolves.toEqual({ n: 2 })
  })

  it('skips when key returns undefined', async () => {
    let started = 0
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => {
        started++
        await gate
        return input
      }),
    })
    const client = createLocalClient(app, {
      context: {},
      plugins: [new DedupePlugin({ key: () => undefined })],
    })
    const p1 = client.echo({ n: 1 })
    const p2 = client.echo({ n: 1 })
    await waitUntil(() => started === 2)
    expect(started).toBe(2)
    release()
    await expect(p1).resolves.toEqual({ n: 1 })
    await expect(p2).resolves.toEqual({ n: 1 })
  })

  it('does not dedupe AsyncIterable input', async () => {
    const ingestContract = router({
      ingest: procedure.input(z.unknown()),
    })
    let started = 0
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const impl = createImplementer(ingestContract)
    const app = impl.router({
      ingest: impl.ingest.handler(async () => {
        started++
        await gate
        return 'ok'
      }),
    })
    const client = createLocalClient(app, {
      context: {},
      plugins: [new DedupePlugin()],
    })
    async function* items() {
      yield 1
    }
    const input = items()
    const p1 = client.ingest(input)
    const p2 = client.ingest(input)
    await waitUntil(() => started === 2)
    expect(started).toBe(2)
    release()
    await expect(p1).resolves.toBe('ok')
    await expect(p2).resolves.toBe('ok')
  })

  it('keeps remaining waiter succeeding if one of two aborts', async () => {
    let started = 0
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => {
        started++
        await gate
        return input
      }),
    })
    const client = createLocalClient(app, {
      context: {},
      plugins: [new DedupePlugin()],
    })
    const ac = new AbortController()
    const p1 = client.echo({ n: 1 }, { signal: ac.signal })
    const p2 = client.echo({ n: 1 })
    await waitUntil(() => started === 1)
    ac.abort()
    release()
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' })
    await expect(p2).resolves.toEqual({ n: 1 })
    expect(started).toBe(1)
  })

  it('cancels shared work when the last waiter aborts', async () => {
    let started = 0
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    let seen: AbortSignal | undefined
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input, signal }) => {
        started++
        seen = signal
        await gate
        return input
      }),
    })
    const client = createLocalClient(app, {
      context: {},
      plugins: [new DedupePlugin()],
    })
    const ac = new AbortController()
    const p = client.echo({ n: 1 }, { signal: ac.signal })
    await waitUntil(() => started === 1)
    ac.abort()
    expect(seen?.aborted).toBe(true)
    release()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('runs the handler again after the in-flight call settles', async () => {
    let started = 0
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => {
        started++
        await gate
        return input
      }),
    })
    const client = createLocalClient(app, {
      context: {},
      plugins: [new DedupePlugin()],
    })
    const p1 = client.echo({ n: 1 })
    const p2 = client.echo({ n: 1 })
    await waitUntil(() => started === 1)
    release()
    await expect(p1).resolves.toEqual({ n: 1 })
    await expect(p2).resolves.toEqual({ n: 1 })
    expect(started).toBe(1)
    expect(await client.echo({ n: 1 })).toEqual({ n: 1 })
    expect(started).toBe(2)
  })

  it('rejects an already-aborted joiner without aborting others', async () => {
    let started = 0
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    let seen: AbortSignal | undefined
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input, signal }) => {
        started++
        seen = signal
        await gate
        return input
      }),
    })
    const client = createLocalClient(app, {
      context: {},
      plugins: [new DedupePlugin()],
    })
    const p1 = client.echo({ n: 1 })
    await waitUntil(() => started === 1)
    const ac = new AbortController()
    ac.abort()
    const p2 = client.echo({ n: 1 }, { signal: ac.signal })
    await expect(p2).rejects.toMatchObject({ name: 'AbortError' })
    expect(seen?.aborted).toBe(false)
    expect(started).toBe(1)
    release()
    await expect(p1).resolves.toEqual({ n: 1 })
  })

  it('starts new work after the last waiter aborts', async () => {
    let started = 0
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => {
        started++
        await gate
        return input
      }),
    })
    const client = createLocalClient(app, {
      context: {},
      plugins: [new DedupePlugin()],
    })
    const ac = new AbortController()
    const p1 = client.echo({ n: 1 }, { signal: ac.signal })
    await waitUntil(() => started === 1)
    ac.abort()
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' })
    const p2 = client.echo({ n: 1 })
    await waitUntil(() => started === 2)
    expect(started).toBe(2)
    release()
    await expect(p2).resolves.toEqual({ n: 1 })
  })

  it('does not coalesce calls with different context objects', async () => {
    let started = 0
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const impl = createImplementer(contract).$context<{ id: number }>()
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => {
        started++
        await gate
        return input
      }),
    })
    const plugin = new DedupePlugin()
    const a = createLocalClient(app, {
      context: { id: 1 },
      plugins: [plugin],
    })
    const b = createLocalClient(app, {
      context: { id: 2 },
      plugins: [plugin],
    })
    const p1 = a.echo({ n: 1 })
    const p2 = b.echo({ n: 1 })
    await waitUntil(() => started === 2)
    expect(started).toBe(2)
    release()
    await expect(p1).resolves.toEqual({ n: 1 })
    await expect(p2).resolves.toEqual({ n: 1 })
  })
})
