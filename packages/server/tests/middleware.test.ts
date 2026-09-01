import { oc } from '@ts-pf/contract'
import { createRouterClient, implement } from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const contract = oc.router({
  ping: oc.output(z.string()),
  echo: oc
    .input(z.object({ n: z.number() }))
    .output(z.object({ n: z.number() })),
})

describe('middleware', () => {
  it('middleware .use runs before validation', async () => {
    const order: string[] = []
    const os = implement(contract).$context<{ seen: string[] }>()
    const mw = os.middleware(async ({ next, input }) => {
      order.push('use')
      expect(input).toEqual({ n: 'x' })
      return next()
    })
    const router = os.use(mw).router({
      ping: os.ping.handler(async () => 'pong'),
      echo: os.echo.handler(async ({ input }) => input),
    })
    const client = createRouterClient(router, { context: { seen: [] } })
    await expect(client.echo({ n: 'x' } as never)).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    expect(order).toEqual(['use'])
  })

  it('middleware .useAfter sees typed input', async () => {
    const os = implement(contract)
    const seen: number[] = []
    const router = os.router({
      ping: os.ping.handler(async () => 'pong'),
      echo: os.echo
        .useAfter(async ({ input, next }) => {
          seen.push((input as { n: number }).n)
          return next()
        })
        .handler(async ({ input }) => input),
    })
    const client = createRouterClient(router, { context: {} })
    await client.echo({ n: 7 })
    expect(seen).toEqual([7])
  })

  it('middleware can inject context', async () => {
    const os = implement(contract).$context<{ user?: { id: number } }>()
    const auth = os.middleware(async ({ next }) =>
      next({ context: { user: { id: 1 } } }),
    )
    const router = os.use(auth).router({
      ping: os.ping.handler(async ({ context }) => `user-${context.user?.id}`),
      echo: os.echo.handler(async ({ input }) => input),
    })
    const client = createRouterClient(router, { context: {} })
    expect(await client.ping()).toBe('user-1')
  })
})
