import type { BackpressureOptions } from '@ts-pf/message'
import { isAsyncIterable, localFailure, type PFError } from '@ts-pf/protocol'

export type { BackpressureOptions, StallInfo } from '@ts-pf/message'

export type LinkOptions = {
  meta?: unknown
  maxFrameBytes?: number
  helloTimeoutMs?: number
  /**
   * Slow-peer protection for input streams this client pushes and output
   * streams it reads, on by default (1 MiB `highWaterMark`, 30 s
   * `drainTimeout`, one `console.warn` per stall). A bad value throws a
   * `TypeError` from the constructor.
   */
  backpressure?: BackpressureOptions
}

/** Envelope items only: a `ReadableStream` is bytes, not items; it is sent as a plain JSON value. */
export function isItemStream(value: unknown): value is AsyncIterable<unknown> {
  return (
    isAsyncIterable(value) &&
    !(typeof ReadableStream !== 'undefined' && value instanceof ReadableStream)
  )
}

export function abortedFailure(signal: AbortSignal): PFError {
  return signal.reason !== undefined
    ? localFailure('Request aborted', signal.reason)
    : localFailure('Request aborted')
}

/**
 * `promise`, or a local `Request aborted` as soon as `signal` fires. An
 * abort that lands before the promise settles wins even if both are
 * observed in the same turn. Without a signal this is `promise` itself.
 */
export function awaitWithAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal === undefined) {
    return promise
  }
  if (signal.aborted) {
    return Promise.reject(abortedFailure(signal))
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort)
      reject(abortedFailure(signal))
    }
    signal.addEventListener('abort', onAbort)
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        if (signal.aborted) {
          reject(abortedFailure(signal))
          return
        }
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        if (signal.aborted) {
          reject(abortedFailure(signal))
          return
        }
        reject(error)
      },
    )
  })
}
