import { procedure, router } from '@ts-pf/contract'
import { createImplementer } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { SseCodec, stream } from '@ts-pf/stream'
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

async function streamBody(
  codec: SseCodec,
  iterable: AsyncIterable<unknown>,
): Promise<ReadableStream<Uint8Array>> {
  const encoded = await codec.encodeSuccess(iterable)
  if (!(encoded.body instanceof ReadableStream)) {
    throw new Error('expected a stream body')
  }
  return encoded.body
}

describe('SseCodec producer cleanup', () => {
  const codec = new SseCodec({ keepAliveMs: 0 })
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
    const contract = router({
      chat: procedure.output(stream(z.object({ token: z.string() }))),
    })
    const impl = createImplementer(contract)
    const app = impl.router({
      chat: impl.chat.handler(async () => iterable as never),
    })
    const handler = new FetchHandler(app, {
      codec,
      validation: { output: true },
    })
    const result = await handler.handle(
      new Request('http://localhost/rpc/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"input":null}',
      }),
      { prefix: '/rpc', context: {} },
    )
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
    await (await streamBody(codec, iterable)).cancel()
    await tick()
    expect(returned).toHaveBeenCalledTimes(1)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('returns the producer once when an item cannot be encoded', async () => {
    const { iterable, returned } = producer([{ n: 1n }])
    const text = await new Response(await streamBody(codec, iterable)).text()
    expect(text).toContain('event: error')
    expect(text).not.toContain('event: close')
    expect(returned).toHaveBeenCalledTimes(1)
  })
})
