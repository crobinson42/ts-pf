import { callClient } from './call-client.js'
import { inputFromKey } from './key.js'
import type { SwrSubscriber, SwrSubscriberOptions } from './types.js'

export function createSubscriber(
  client: unknown,
  options: SwrSubscriberOptions = {},
): SwrSubscriber<unknown, unknown[]> {
  const refetchMode = options.refetchMode ?? 'reset'
  const maxChunks = options.maxChunks

  return (key, { next }) => {
    const controller = new AbortController()

    void (async () => {
      try {
        const iterator = await callClient(
          client,
          inputFromKey(key),
          controller.signal,
        )
        if (!isAsyncIterable(iterator)) {
          throw new TypeError('.subscriber requires an AsyncIterable output')
        }

        let hasPreviousData = false
        if (refetchMode === 'reset') {
          next(undefined, undefined)
        } else if (refetchMode === 'replace') {
          next(undefined, (old) => {
            hasPreviousData = old !== undefined
            return old as unknown[]
          })
        }

        const updateDuringStream = refetchMode !== 'replace' || !hasPreviousData
        let buffer: unknown[] = []

        for await (const event of iterator) {
          if (updateDuringStream) {
            next(undefined, (old) => cap(append(old, event), maxChunks))
          } else {
            buffer = cap([...buffer, event], maxChunks)
          }
        }

        if (!updateDuringStream) {
          next(undefined, buffer)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          next(error as Error)
        }
      }
    })()

    return () => {
      controller.abort()
    }
  }
}

export function createLiveSubscriber(
  client: unknown,
): SwrSubscriber<unknown, unknown> {
  return (key, { next }) => {
    const controller = new AbortController()

    void (async () => {
      try {
        const iterator = await callClient(
          client,
          inputFromKey(key),
          controller.signal,
        )
        if (!isAsyncIterable(iterator)) {
          throw new TypeError(
            '.liveSubscriber requires an AsyncIterable output',
          )
        }
        for await (const event of iterator) {
          next(undefined, event)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          next(error as Error)
        }
      }
    })()

    return () => {
      controller.abort()
    }
  }
}

function append(old: unknown[] | undefined, event: unknown): unknown[] {
  return Array.isArray(old) ? [...old, event] : [event]
}

function cap(items: unknown[], maxChunks: number | undefined): unknown[] {
  if (maxChunks === undefined || items.length <= maxChunks) {
    return items
  }
  return items.slice(items.length - maxChunks)
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  if (
    typeof ReadableStream !== 'undefined' &&
    value instanceof ReadableStream
  ) {
    return false
  }
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
      'function'
  )
}
