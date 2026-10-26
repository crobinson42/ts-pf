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
      status: undefined,
    })
    await expect(client.find({ id: 1 })).rejects.not.toMatchObject({
      data: { id: 'nope' },
    })
  })

  it('keeps the original declared error as cause, off the wire', async () => {
    const c = router({
      find: procedure.errors({
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
    const err = (await client.find().catch((e: unknown) => e)) as PFError
    expect(err).toBeInstanceOf(PFError)
    expect(err.cause).toBeInstanceOf(PFError)
    expect((err.cause as PFError).code).toBe('NOT_FOUND')
    expect((err.cause as PFError).data).toEqual({ id: 'nope' })
    expect(JSON.parse(JSON.stringify(err))).toEqual({
      code: 'INTERNAL',
      message: 'Internal server error',
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

  it('output schema failure is INTERNAL without issues', async () => {
    const c = router({ ping: procedure.output(z.string()) })
    const impl = createImplementer(c)
    const app = impl.router({
      ping: impl.ping.handler(async () => 1 as never),
    })
    const client = createLocalClient(app, {
      context: {},
      validation: { output: true },
    })
    const err = await client.ping().then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(err).toMatchObject({ code: 'INTERNAL' })
    expect(err).toBeInstanceOf(PFError)
    expect((err as PFError).status).toBeUndefined()
    expect((err as PFError).data).toBeUndefined()
    // The schema issues ride on `cause` for the server log only.
    expect((err as PFError).cause).toEqual([
      expect.objectContaining({ message: expect.any(String) }),
    ])
    expect(JSON.parse(JSON.stringify(err))).toEqual({
      code: 'INTERNAL',
      message: 'Internal server error',
    })
  })

  it('returns handler output when output validation is off', async () => {
    const c = router({ ping: procedure.output(z.string()) })
    const impl = createImplementer(c)
    const app = impl.router({
      ping: impl.ping.handler(async () => 1 as never),
    })
    const client = createLocalClient(app, { context: {} })
    expect(await client.ping()).toBe(1)
  })

  it('skips input validation when validation.input is false', async () => {
    const c = router({
      echo: procedure
        .input(z.object({ n: z.number() }))
        .output(z.object({ n: z.number() })),
    })
    const impl = createImplementer(c)
    const app = impl.router({
      echo: impl.echo.handler(async ({ input }) => input),
    })
    const client = createLocalClient(app, {
      context: {},
      validation: { input: false },
    })
    expect(await client.echo({ n: 'x' } as never)).toEqual({ n: 'x' })
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
      status: undefined,
    })
  })

  it('stamps a declared status and leaves it undefined when not declared', async () => {
    const c = router({
      ping: procedure.errors({
        TEAPOT: { message: 'short and stout' },
        GONE: { status: 410 },
      }),
    })
    const impl = createImplementer(c)
    const teapot = createLocalClient(
      impl.router({
        ping: impl.ping.handler(async ({ errors }) => {
          throw errors.TEAPOT()
        }),
      }),
      { context: {} },
    )
    const gone = createLocalClient(
      impl.router({
        ping: impl.ping.handler(async ({ errors }) => {
          throw errors.GONE()
        }),
      }),
      { context: {} },
    )
    const teapotError = await teapot.ping().then(
      () => undefined,
      (error: unknown) => error as PFError,
    )
    expect(teapotError?.code).toBe('TEAPOT')
    expect(teapotError?.status).toBeUndefined()
    await expect(gone.ping()).rejects.toMatchObject({
      code: 'GONE',
      status: 410,
    })
  })

  it('shares one frozen errors factory across calls', async () => {
    const c = router({
      find: procedure.errors({ NOT_FOUND: { status: 404 } }),
    })
    const impl = createImplementer(c)
    const seen: unknown[] = []
    const app = impl.router({
      find: impl.find.handler(async ({ errors }) => {
        seen.push(errors)
        return null
      }),
    })
    const client = createLocalClient(app, { context: {} })
    await client.find()
    await client.find()
    expect(seen[0]).toBe(seen[1])
    expect(Object.isFrozen(seen[0])).toBe(true)
  })
})
