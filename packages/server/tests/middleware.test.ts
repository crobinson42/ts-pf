import { procedure, router } from '@ts-pf/contract'
import { createImplementer, createLocalClient } from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  ping: procedure.output(z.string()),
  echo: procedure
    .input(z.object({ n: z.number() }))
    .output(z.object({ n: z.number() })),
})

describe('middleware', () => {
  it('middleware .use runs before validation', async () => {
    const order: string[] = []
    const impl = createImplementer(contract).$context<{ seen: string[] }>()
    const mw = impl.middleware(async ({ next, input }) => {
      order.push('use')
      expect(input).toEqual({ n: 'x' })
      return next()
    })
    const app = impl.use(mw).router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, { context: { seen: [] } })
    await expect(client.echo({ n: 'x' } as never)).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    expect(order).toEqual(['use'])
  })

  it('middleware .useAfter sees typed input', async () => {
    const impl = createImplementer(contract)
    const seen: number[] = []
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo
        .useAfter(async ({ input, next }) => {
          seen.push((input as { n: number }).n)
          return next()
        })
        .handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, { context: {} })
    await client.echo({ n: 7 })
    expect(seen).toEqual([7])
  })

  it('impl.middleware() runs on a per-procedure .use() too', async () => {
    const order: string[] = []
    const impl = createImplementer(contract).$context<{ seen: string[] }>()
    const trace = impl.middleware(async ({ next, path }) => {
      order.push(path.join('.'))
      return next()
    })
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.use(trace).handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, { context: { seen: [] } })
    expect(await client.echo({ n: 1 })).toEqual({ n: 1 })
    expect(await client.ping()).toBe('pong')
    expect(order).toEqual(['echo'])
  })

  it('middleware can inject context', async () => {
    const impl = createImplementer(contract).$context<{
      user?: { id: number }
    }>()
    const auth = impl.middleware(async ({ next }) =>
      next({ context: { user: { id: 1 } } }),
    )
    const app = impl.use(auth).router({
      ping: impl.ping.handler(
        async ({ context }) => `user-${context.user?.id}`,
      ),
      echo: impl.echo.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, { context: {} })
    expect(await client.ping()).toBe('user-1')
  })
})
