import { procedure, router } from '@ts-pf/contract'
import {
  createImplementer,
  createLocalClient,
  onError,
  onFinish,
  onStart,
  onSuccess,
} from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  ping: procedure.output(z.string()),
  echo: procedure
    .input(z.object({ n: z.number() }))
    .output(z.object({ n: z.number() })),
})

describe('event helpers', () => {
  it('onStart runs before next', async () => {
    const order: string[] = []
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => {
        order.push('handler')
        return 'pong'
      }),
      echo: impl.echo.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, {
      context: { user: 1 },
      interceptors: [
        onStart((ctx) => {
          order.push('start')
          expect(ctx.path).toEqual(['ping'])
          expect(ctx.context).toEqual({ user: 1 })
        }),
      ],
    })
    expect(await client.ping()).toBe('pong')
    expect(order).toEqual(['start', 'handler'])
  })

  it('onSuccess runs with the output', async () => {
    let seen: unknown
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, {
      context: {},
      interceptors: [
        onSuccess((_ctx, output) => {
          seen = output
        }),
      ],
    })
    expect(await client.ping()).toBe('pong')
    expect(seen).toBe('pong')
  })

  it('onError runs on throw and the throw still propagates', async () => {
    const original = new Error('boom')
    let seen: unknown
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => {
        throw original
      }),
      echo: impl.echo.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, {
      context: {},
      interceptors: [
        onError((_ctx, error) => {
          seen = error
        }),
      ],
    })
    await expect(client.ping()).rejects.toBe(original)
    expect(seen).toBe(original)
  })

  it('onError on failure does not swallow the original error even if onError throws', async () => {
    const original = new Error('original')
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => {
        throw original
      }),
      echo: impl.echo.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, {
      context: {},
      interceptors: [
        onError(() => {
          throw new Error('observer')
        }),
      ],
    })
    await expect(client.ping()).rejects.toBe(original)
  })

  it('onFinish runs on success and failure', async () => {
    const results: unknown[] = []
    const original = new Error('boom')
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async () => {
        throw original
      }),
    })
    const client = createLocalClient(app, {
      context: {},
      interceptors: [
        onFinish((_ctx, result) => {
          results.push(result)
        }),
      ],
    })
    expect(await client.ping()).toBe('pong')
    await expect(client.echo({ n: 1 })).rejects.toBe(original)
    expect(results).toEqual([
      { ok: true, output: 'pong' },
      { ok: false, error: original },
    ])
  })

  it('onFinish on failure does not swallow the original error even if onFinish throws', async () => {
    const original = new Error('boom')
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => {
        throw original
      }),
      echo: impl.echo.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, {
      context: {},
      interceptors: [
        onFinish(() => {
          throw new Error('finish')
        }),
      ],
    })
    await expect(client.ping()).rejects.toBe(original)
  })

  it('passes input, context, and signal through event ctx', async () => {
    const ac = new AbortController()
    const seen: unknown[] = []
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, {
      context: { db: true },
      interceptors: [
        onStart((ctx) => {
          seen.push({
            path: ctx.path,
            input: ctx.input,
            context: ctx.context,
            signal: ctx.signal,
          })
        }),
      ],
    })
    expect(await client.echo({ n: 4 }, { signal: ac.signal })).toEqual({
      n: 4,
    })
    expect(seen).toEqual([
      {
        path: ['echo'],
        input: { n: 4 },
        context: { db: true },
        signal: ac.signal,
      },
    ])
  })
})
