import { procedure, router } from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import { createImplementer, createLocalClient } from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

describe('declared error data', () => {
  it('invalid error data becomes INTERNAL and is not serialized', async () => {
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
      find: impl.find.handler(async ({ errors }) => {
        throw errors.NOT_FOUND({ id: 'nope' } as never)
      }),
    })
    const client = createLocalClient(app, { context: {} })
    await expect(client.find({ id: 1 })).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 500,
    })
    await expect(client.find({ id: 1 })).rejects.not.toMatchObject({
      data: { id: 'nope' },
    })
  })

  it('undeclared PFError codes pass through', async () => {
    const c = router({
      ping: procedure.output(z.string()),
    })
    const impl = createImplementer(c)
    const app = impl.router({
      ping: impl.ping.handler(async () => {
        throw new PFError({
          code: 'UNAUTHORIZED',
          status: 401,
          message: 'nope',
        })
      }),
    })
    const client = createLocalClient(app, { context: {} })
    await expect(client.ping()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    })
  })

  it('output schema failure is INTERNAL 500 without issues', async () => {
    const c = router({ ping: procedure.output(z.string()) })
    const impl = createImplementer(c)
    const app = impl.router({
      ping: impl.ping.handler(async () => 1 as never),
    })
    const client = createLocalClient(app, { context: {} })
    const err = await client.ping().then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(err).toMatchObject({ code: 'INTERNAL', status: 500 })
    expect(err).toBeInstanceOf(PFError)
    expect((err as PFError).data).toBeUndefined()
  })

  it('validates error data thrown from an async iterable', async () => {
    const c = router({
      chat: procedure.errors({
        LIMIT: { status: 429, data: z.object({ retryAfter: z.number() }) },
      }),
    })
    const impl = createImplementer(c)
    const app = impl.router({
      chat: impl.chat.handler(async function* ({ errors }) {
        yield
        throw errors.LIMIT({ retryAfter: 'x' as never })
      }),
    })
    const client = createLocalClient(app, { context: {} })
    const iter = (await client.chat()) as AsyncIterable<unknown>
    await expect(async () => {
      for await (const _item of iter) {
        // drain
      }
    }).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 500,
    })
  })
})
