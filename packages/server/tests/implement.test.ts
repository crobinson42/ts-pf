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

describe('createImplementer', () => {
  it('createImplementer().router type-checks and runs a handler', async () => {
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, { context: {} })
    expect(await client.ping()).toBe('pong')
    expect(await client.echo({ n: 1 })).toEqual({ n: 1 })
  })

  it('throws PFError VALIDATION on bad input', async () => {
    const impl = createImplementer(contract)
    const app = impl.router({
      ping: impl.ping.handler(async () => 'pong'),
      echo: impl.echo.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, { context: {} })
    await expect(client.echo({ n: 'x' } as never)).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 422,
    })
  })

  it('errors.NOT_FOUND throws typed PFError', async () => {
    const c = router({
      find: procedure
        .input(z.object({ id: z.number() }))
        .output(z.object({ id: z.number() }))
        .errors({
          NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
        }),
    })
    const impl = createImplementer(c)
    const app = impl.router({
      find: impl.find.handler(async ({ errors, input }) => {
        throw errors.NOT_FOUND({ id: input.id })
      }),
    })
    const client = createLocalClient(app, { context: {} })
    await expect(client.find({ id: 9 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      data: { id: 9 },
    })
  })
})
