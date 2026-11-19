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

describe('declared status on a hand-thrown PFError', () => {
  const c = router({
    lag: procedure.errors({ Conflict: { status: 409 } }),
    find: procedure.errors({
      NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
    }),
    plain: procedure.errors({ TEAPOT: { message: 'short and stout' } }),
    feed: procedure.errors({ Conflict: { status: 409 } }),
  })
  const impl = createImplementer(c)

  function rejection(promise: Promise<unknown>): Promise<PFError> {
    return promise.then(
      () => {
        throw new Error('expected a rejection')
      },
      (error: unknown) => error as PFError,
    )
  }

  it('fills the declared status and keeps cause and message', async () => {
    const cause = new Error('upstream lag')
    const app = impl.router({
      lag: impl.lag.handler(async () => {
        throw new PFError({ code: 'Conflict', message: 'behind', cause })
      }),
      find: impl.find.handler(async () => null),
      plain: impl.plain.handler(async () => null),
      feed: impl.feed.handler(async () => null),
    })
    const err = await rejection(createLocalClient(app, { context: {} }).lag())
    expect(err).toBeInstanceOf(PFError)
    expect(err.code).toBe('Conflict')
    expect(err.status).toBe(409)
    expect(err.message).toBe('behind')
    expect(err.cause).toBe(cause)
    expect(err.toJSON()).toEqual({ code: 'Conflict', message: 'behind' })
  })

  it('does not fill message', async () => {
    const app = impl.router({
      lag: impl.lag.handler(async () => null),
      find: impl.find.handler(async () => null),
      plain: impl.plain.handler(async () => {
        throw new PFError({ code: 'TEAPOT' })
      }),
      feed: impl.feed.handler(async () => null),
    })
    const err = await rejection(createLocalClient(app, { context: {} }).plain())
    expect(err.message).toBe('TEAPOT')
    expect(err.status).toBeUndefined()
  })

  it('fills status on a declared code with valid data and keeps cause', async () => {
    const cause = new Error('row missing')
    const app = impl.router({
      lag: impl.lag.handler(async () => null),
      find: impl.find.handler(async () => {
        throw new PFError({ code: 'NOT_FOUND', data: { id: 7 }, cause })
      }),
      plain: impl.plain.handler(async () => null),
      feed: impl.feed.handler(async () => null),
    })
    const err = await rejection(createLocalClient(app, { context: {} }).find())
    expect(err.code).toBe('NOT_FOUND')
    expect(err.status).toBe(404)
    expect(err.data).toEqual({ id: 7 })
    expect(err.cause).toBe(cause)
  })

  it('keeps an explicit status', async () => {
    let thrown: PFError | undefined
    const app = impl.router({
      lag: impl.lag.handler(async () => {
        thrown = new PFError({ code: 'Conflict', status: 503 })
        throw thrown
      }),
      find: impl.find.handler(async () => null),
      plain: impl.plain.handler(async () => null),
      feed: impl.feed.handler(async () => null),
    })
    const err = await rejection(createLocalClient(app, { context: {} }).lag())
    expect(err).toBe(thrown)
    expect(err.status).toBe(503)
  })

  it('leaves an undeclared code untouched', async () => {
    let thrown: PFError | undefined
    const app = impl.router({
      lag: impl.lag.handler(async () => {
        thrown = new PFError({ code: 'NOT_FOUND' })
        throw thrown
      }),
      find: impl.find.handler(async () => null),
      plain: impl.plain.handler(async () => null),
      feed: impl.feed.handler(async () => null),
    })
    const err = await rejection(createLocalClient(app, { context: {} }).lag())
    expect(err).toBe(thrown)
    expect(err.status).toBeUndefined()
  })

  it('fills status on a stream that throws before its first item', async () => {
    const cause = new Error('fell behind')
    const app = impl.router({
      lag: impl.lag.handler(async () => null),
      find: impl.find.handler(async () => null),
      plain: impl.plain.handler(async () => null),
      feed: impl.feed.handler(async function* () {
        yield* []
        throw new PFError({ code: 'Conflict', cause })
      }),
    })
    const iter = (await createLocalClient(app, {
      context: {},
    }).feed()) as AsyncIterable<unknown>
    const err = await rejection(iter[Symbol.asyncIterator]().next())
    expect(err.code).toBe('Conflict')
    expect(err.status).toBe(409)
    expect(err.cause).toBe(cause)
  })
})
