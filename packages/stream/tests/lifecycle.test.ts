import { procedure, router } from '@ts-pf/contract'
import { createImplementer } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { StreamCodec, stream } from '@ts-pf/stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

/**
 * A hand-written producer (not a generator, so `return()` always reaches it).
 * `next()` yields `items` in order, then parks until `return()` is called.
 */
function producer(items: unknown[], onReturn?: () => Promise<void>) {
  let release: (() => void) | undefined
  const parked = new Promise<void>((resolve) => {
    release = resolve
  })
  // The spy wraps a sync call: a spy around the async `return` would attach
  // its own handler to the promise and hide an unhandled rejection.
  const returned = vi.fn()
  const iterator: AsyncIterator<unknown> = {
    next: async () => {
      if (items.length > 0) {
        return { done: false, value: items.shift() }
      }
      await parked
      return { done: true, value: undefined }
    },
    return: async () => {
      returned()
      release?.()
      await onReturn?.()
      return { done: true, value: undefined }
    },
  }
  const iterable: AsyncIterable<unknown> = {
    [Symbol.asyncIterator]: () => iterator,
  }
  return { iterable, returned }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 10))

const contract = router({
  chat: procedure.output(stream(z.object({ token: z.string() }))),
  ingest: procedure
    .input(stream(z.object({ chunk: z.number() })))
    .output(z.object({ count: z.number() })),
})

function appReturning(iterable: AsyncIterable<unknown>) {
  const impl = createImplementer(contract)
  return impl.router({
    chat: impl.chat.handler(async () => iterable as never),
    ingest: impl.ingest.handler(async () => ({ count: 0 })),
  })
}

function post(handler: FetchHandler, path: string) {
  return handler.handle(
    new Request(`http://localhost/rpc/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"input":null}',
    }),
    { prefix: '/rpc', context: {} },
  )
}

describe('stream() item validation wrapper', () => {
  const schema = stream(z.object({ token: z.string() }))

  async function wrapped(iterable: AsyncIterable<unknown>) {
    const result = await schema['~standard'].validate(iterable)
    if (result.issues) {
      throw new Error('expected a stream')
    }
    return result.value[Symbol.asyncIterator]()
  }

  it('forwards return() to the source before the first next()', async () => {
    const { iterable, returned } = producer([{ token: 'a' }])
    const iterator = await wrapped(iterable)
    await iterator.return?.()
    expect(returned).toHaveBeenCalledTimes(1)
  })

  it('forwards return() while a next() is pending', async () => {
    const { iterable, returned } = producer([])
    const iterator = await wrapped(iterable)
    const pending = iterator.next()
    await iterator.return?.()
    expect(returned).toHaveBeenCalledTimes(1)
    await expect(pending).resolves.toEqual({ done: true, value: undefined })
  })

  it('closes the source and throws VALIDATION with issues for a bad item', async () => {
    const { iterable, returned } = producer([{ token: 1 }])
    const iterator = await wrapped(iterable)
    await expect(iterator.next()).rejects.toMatchObject({
      code: 'VALIDATION',
      data: { issues: [{ message: expect.any(String) }] },
    })
    expect(returned).toHaveBeenCalledTimes(1)
  })
})

describe('StreamCodec producer cleanup', () => {
  const unhandled = vi.fn()
  beforeEach(() => {
    unhandled.mockClear()
    process.on('unhandledRejection', unhandled)
  })
  afterEach(() => {
    process.off('unhandledRejection', unhandled)
  })

  it('reaches the handler iterator when the client cancels before the first item (validation.output)', async () => {
    const { iterable, returned } = producer([])
    const handler = new FetchHandler(appReturning(iterable), {
      codec: new StreamCodec(),
      validation: { output: true },
    })
    const result = await post(handler, 'chat')
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(200)
    await result.response.body?.cancel()
    expect(returned).toHaveBeenCalledTimes(1)
  })

  it('drops a rejecting return() on cancel without an unhandled rejection', async () => {
    const { iterable, returned } = producer([], async () => {
      throw new Error('cleanup failed')
    })
    const encoded = await new StreamCodec().encodeSuccess(iterable)
    if (!(encoded.body instanceof ReadableStream)) {
      throw new Error('expected a stream body')
    }
    await encoded.body.cancel()
    await tick()
    expect(returned).toHaveBeenCalledTimes(1)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('returns the producer once when an item cannot be encoded', async () => {
    const { iterable, returned } = producer([{ n: 1n }])
    const encoded = await new StreamCodec().encodeSuccess(iterable)
    if (!(encoded.body instanceof ReadableStream)) {
      throw new Error('expected a stream body')
    }
    const text = await new Response(encoded.body).text()
    expect(JSON.parse(text.trim())).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL' },
    })
    expect(returned).toHaveBeenCalledTimes(1)
  })
})

describe('stream() procedures on a JSON-only FetchHandler', () => {
  it.each(['chat', 'ingest'] as const)(
    'answers %s with 400 BAD_REQUEST',
    async (path) => {
      const { iterable, returned } = producer([])
      const result = await post(new FetchHandler(appReturning(iterable)), path)
      if (!result.matched) {
        throw new Error('expected match')
      }
      expect(result.response.status).toBe(400)
      expect(await result.response.json()).toEqual({
        ok: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Stream procedure requires a streaming codec',
        },
      })
      expect(returned).not.toHaveBeenCalled()
    },
  )
})
