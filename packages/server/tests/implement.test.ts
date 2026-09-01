import { oc } from '@ts-pf/contract'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createRouterClient, implement } from '@ts-pf/server'

const contract = oc.router({
  ping: oc.output(z.string()),
  echo: oc.input(z.object({ n: z.number() })).output(z.object({ n: z.number() })),
})

describe('implement', () => {
  it('implement().router type-checks and runs a handler', async () => {
    const os = implement(contract)
    const router = os.router({
      ping: os.ping.handler(async () => 'pong'),
      echo: os.echo.handler(async ({ input }) => input),
    })
    const client = createRouterClient(router, { context: {} })
    expect(await client.ping()).toBe('pong')
    expect(await client.echo({ n: 1 })).toEqual({ n: 1 })
  })

  it('throws PFError VALIDATION on bad input', async () => {
    const os = implement(contract)
    const router = os.router({
      ping: os.ping.handler(async () => 'pong'),
      echo: os.echo.handler(async ({ input }) => input),
    })
    const client = createRouterClient(router, { context: {} })
    await expect(client.echo({ n: 'x' } as never)).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 422,
    })
  })

  it('errors.NOT_FOUND throws typed PFError', async () => {
    const c = oc.router({
      find: oc
        .input(z.object({ id: z.number() }))
        .output(z.object({ id: z.number() }))
        .errors({ NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) } }),
    })
    const os = implement(c)
    const router = os.router({
      find: os.find.handler(async ({ errors, input }) => {
        throw errors.NOT_FOUND({ id: input.id })
      }),
    })
    const client = createRouterClient(router, { context: {} })
    await expect(client.find({ id: 9 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      data: { id: 9 },
    })
  })
})
