import { describe, expect, it, vi } from 'vitest'
import { generateSwrKey } from '../src/key.js'
import { createLiveSubscriber, createSubscriber } from '../src/subscriber.js'
import type { SwrSubscriptionNext } from '../src/types.js'

function trackNext<Data>(initial?: Data) {
  let data: Data | undefined = initial
  const next: SwrSubscriptionNext<Data, unknown> = vi.fn((_error, update) => {
    data =
      typeof update === 'function'
        ? (update as (previous: Data | undefined) => Data)(data)
        : update
  })
  return {
    next,
    get data() {
      return data
    },
  }
}

async function* chunks(
  values: string[],
  onAbort?: () => void,
  signal?: AbortSignal,
): AsyncIterable<string> {
  for (const value of values) {
    if (signal?.aborted) {
      onAbort?.()
      throw new Error('aborted')
    }
    yield value
  }
}

describe('createSubscriber', () => {
  it('accumulates chunks', async () => {
    const client = vi.fn(async () => chunks(['a', 'b', 'c']))
    const subscriber = createSubscriber(client)
    const tracked = trackNext<unknown[]>()
    const unsubscribe = subscriber(generateSwrKey(['chat']), {
      next: tracked.next,
    })
    await vi.waitFor(() => {
      expect(tracked.data).toEqual(['a', 'b', 'c'])
    })
    unsubscribe()
  })

  it('caps at maxChunks', async () => {
    const client = vi.fn(async () => chunks(['a', 'b', 'c', 'd']))
    const subscriber = createSubscriber(client, { maxChunks: 2 })
    const tracked = trackNext<unknown[]>()
    subscriber(generateSwrKey(['chat']), { next: tracked.next })
    await vi.waitFor(() => {
      expect(tracked.data).toEqual(['c', 'd'])
    })
  })

  it('replace mode buffers until the stream ends when previous data exists', async () => {
    const client = vi.fn(async () => chunks(['x', 'y']))
    const subscriber = createSubscriber(client, { refetchMode: 'replace' })
    let stored: unknown[] | undefined = ['old']
    const next = vi.fn(
      (
        _error?: unknown,
        data?: unknown[] | ((previous: unknown[] | undefined) => unknown[]),
      ) => {
        stored =
          typeof data === 'function'
            ? data(stored)
            : (data as unknown[] | undefined)
      },
    )
    subscriber(generateSwrKey(['chat']), { next })
    await vi.waitFor(() => {
      expect(stored).toEqual(['x', 'y'])
    })
    expect(stored).not.toEqual(['old', 'x', 'y'])
  })

  it('throws when the output is not async-iterable', async () => {
    const client = vi.fn(async () => ({ id: 1 }))
    const subscriber = createSubscriber(client)
    const next = vi.fn()
    subscriber(generateSwrKey(['planet', 'find']), { next })
    await vi.waitFor(() => {
      expect(next.mock.calls.some((call) => call[0] instanceof TypeError)).toBe(
        true,
      )
    })
  })

  it('does not report abort errors', async () => {
    let released: ((value?: unknown) => void) | undefined
    const gate = new Promise((resolve) => {
      released = resolve
    })
    const client = vi.fn(
      async (_input?: unknown, opts?: { signal?: AbortSignal }) => {
        await gate
        return chunks(['a'], undefined, opts?.signal)
      },
    )
    const subscriber = createSubscriber(client)
    const next = vi.fn()
    const unsubscribe = subscriber(generateSwrKey(['chat']), { next })
    unsubscribe()
    released?.()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(next.mock.calls.every((call) => call[0] == null)).toBe(true)
  })
})

describe('createLiveSubscriber', () => {
  it('emits the latest event', async () => {
    const client = vi.fn(async () => chunks(['a', 'b']))
    const subscriber = createLiveSubscriber(client)
    const next = vi.fn()
    subscriber(generateSwrKey(['chat']), { next })
    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(undefined, 'b')
    })
  })
})
