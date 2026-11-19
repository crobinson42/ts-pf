import { procedure, router } from '@ts-pf/contract'
import type { RpcCodec } from '@ts-pf/http'
import { isPFError } from '@ts-pf/protocol'
import { createImplementer, type MiddlewareFn } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const MESSAGE = 'Stream procedure requires a streaming codec'

// What `stream()` from `@ts-pf/stream` builds, minus item validation:
// server-http may not depend on that package, and only the brand matters here.
function streamSchema<T>() {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      types: {
        input: undefined as unknown as AsyncIterable<T>,
        output: undefined as unknown as AsyncIterable<T>,
      },
      validate: (value: unknown) => ({ value: value as AsyncIterable<T> }),
    },
    '~pfStream': { item: undefined },
  }
}

function trackedIterable(onReturn?: () => Promise<unknown>) {
  // The spy wraps a sync call: a spy around the async `return` would attach
  // its own handler to the promise and hide an unhandled rejection.
  const returned = vi.fn()
  const iterable: AsyncIterable<{ token: string }> = {
    [Symbol.asyncIterator]: () => ({
      next: async () => ({ done: false, value: { token: 'a' } }),
      return: async () => {
        returned()
        await onReturn?.()
        return { done: true, value: undefined }
      },
    }),
  }
  return { iterable, returned }
}

const contract = router({
  chat: procedure.output(streamSchema<{ token: string }>()),
  ingest: procedure
    .input(streamSchema<{ chunk: number }>())
    .output(z.object({ count: z.number() })),
  loose: procedure,
})

function post(handler: FetchHandler, path: string, body = '{"input":null}') {
  return handler.handle(
    new Request(`http://localhost/rpc/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    { prefix: '/rpc', context: {} },
  )
}

async function expectStreamRejection(
  result: Awaited<ReturnType<typeof post>>,
): Promise<void> {
  if (!result.matched) {
    throw new Error('expected match')
  }
  expect(result.response.status).toBe(400)
  expect(result.response.headers.get('x-ts-pf-protocol')).toBe('1')
  expect(await result.response.json()).toEqual({
    ok: false,
    error: { code: 'BAD_REQUEST', message: MESSAGE },
  })
}

/** A codec that JSON-encodes anything and does not declare `streams`. */
const unflaggedCodec: RpcCodec = {
  encodeRequest: (req) => ({
    contentType: 'application/json',
    body: JSON.stringify(req),
  }),
  decodeRequest: async (source) =>
    JSON.parse(await source.text()) as { input?: unknown },
  encodeSuccess: (output) => ({
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, output }),
  }),
  encodeFailure: (error) => ({
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error }),
  }),
  decodeResponse: async (source) => JSON.parse(await source.text()),
}

describe('FetchHandler stream procedures on a non-streaming codec', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function setup() {
    const used = vi.fn<MiddlewareFn>(({ next }) => next())
    const chat = vi.fn(async () => trackedIterable().iterable)
    const ingest = vi.fn(async () => ({ count: 0 }))
    const impl = createImplementer(contract)
    const app = impl.use(used).router({
      chat: impl.chat.handler(chat),
      ingest: impl.ingest.handler(ingest),
      loose: impl.loose.handler(async () => undefined),
    })
    return { app, used, chat, ingest }
  }

  it('answers a stream-output procedure with 400 BAD_REQUEST before the handler runs', async () => {
    const { app, used, chat } = setup()
    await expectStreamRejection(await post(new FetchHandler(app), 'chat'))
    expect(used).not.toHaveBeenCalled()
    expect(chat).not.toHaveBeenCalled()
  })

  it('answers a stream-input procedure with 400 BAD_REQUEST before the handler runs', async () => {
    const { app, used, ingest } = setup()
    await expectStreamRejection(await post(new FetchHandler(app), 'ingest'))
    expect(used).not.toHaveBeenCalled()
    expect(ingest).not.toHaveBeenCalled()
  })

  it('answers before the body is decoded or the context is built', async () => {
    const { app } = setup()
    const context = vi.fn(() => ({}))
    const result = await new FetchHandler(app).handle(
      new Request('http://localhost/rpc/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      }),
      { prefix: '/rpc', context },
    )
    await expectStreamRejection(result)
    expect(context).not.toHaveBeenCalled()
  })

  it('takes the error path: plugin onError and the onError option see it', async () => {
    const { app } = setup()
    const pluginError = vi.fn()
    const onError = vi.fn()
    const handler = new FetchHandler(app, {
      plugins: [{ name: 'spy', onError: pluginError }],
      onError,
    })
    await expectStreamRejection(await post(handler, 'chat'))
    expect(pluginError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
    const error: unknown = onError.mock.calls[0]?.[0]
    expect(isPFError(error) && error.code).toBe('BAD_REQUEST')
  })
})

describe('FetchHandler stream output the codec did not encode as a stream', () => {
  function appReturning(iterable: AsyncIterable<unknown>) {
    const impl = createImplementer(contract)
    return impl.router({
      chat: impl.chat.handler(async () => iterable as never),
      ingest: impl.ingest.handler(async () => ({ count: 0 })),
      loose: impl.loose.handler(async () => iterable),
    })
  }

  it('closes the iterator once and answers 400 BAD_REQUEST on a codec without `streams`', async () => {
    const { iterable, returned } = trackedIterable()
    const handler = new FetchHandler(appReturning(iterable), {
      codec: unflaggedCodec,
    })
    await expectStreamRejection(await post(handler, 'chat'))
    expect(returned).toHaveBeenCalledTimes(1)
  })

  it('catches an iterable from a procedure whose contract does not declare a stream', async () => {
    const { iterable, returned } = trackedIterable()
    await expectStreamRejection(
      await post(new FetchHandler(appReturning(iterable)), 'loose'),
    )
    expect(returned).toHaveBeenCalledTimes(1)
  })

  it('drops a rejecting return() without an unhandled rejection', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const { iterable, returned } = trackedIterable(async () => {
        throw new Error('cleanup failed')
      })
      const handler = new FetchHandler(appReturning(iterable), {
        codec: unflaggedCodec,
      })
      await expectStreamRejection(await post(handler, 'chat'))
      expect(returned).toHaveBeenCalledTimes(1)
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('serves the stream when the codec encodes it as a ReadableStream', async () => {
    const { iterable, returned } = trackedIterable()
    const handler = new FetchHandler(appReturning(iterable), {
      codec: {
        ...unflaggedCodec,
        streams: true,
        encodeSuccess: () => ({
          contentType: 'application/jsonl',
          body: new ReadableStream(),
        }),
      },
    })
    const result = await post(handler, 'chat')
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.status).toBe(200)
    expect(returned).not.toHaveBeenCalled()
  })
})
