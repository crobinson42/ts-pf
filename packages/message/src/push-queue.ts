/**
 * An async-iterable queue: a transport adapter pushes into it from a frame
 * callback and a consumer pulls from it with `for await`. One pending
 * `next()` at a time, which is what a single `for await` loop produces.
 *
 * `end()` completes the iteration after the buffered values; `fail(error)`
 * rejects the next pull after them. Both are one-shot: later `push` / `end` /
 * `fail` calls are ignored.
 *
 * Bounded by `highWaterMark`: when the buffered size (the sum of each push's
 * `size`, default 1) exceeds it, `onPause` fires once; `onResume` fires once
 * the consumer has drained it to half the mark, or on `end` / `fail`. Nothing
 * is ever dropped; the callbacks are how a receiver pauses the duplex it
 * reads from. Default `Infinity` (unbounded, no callbacks).
 */
export type PushQueue<T> = AsyncIterable<T> & {
  /** `size` counts against `highWaterMark` (default 1). */
  push(value: T, size?: number): void
  end(): void
  fail(error: unknown): void
}

export type PushQueueOptions = {
  highWaterMark?: number
  onPause?: () => void
  onResume?: () => void
}

type Entry<T> = { value: T; size: number }

export function createPushQueue<T>(
  options: PushQueueOptions = {},
): PushQueue<T> {
  const highWaterMark = options.highWaterMark ?? Number.POSITIVE_INFINITY
  const entries: Entry<T>[] = []
  let buffered = 0
  let paused = false
  let pending:
    | {
        resolve: (result: IteratorResult<T>) => void
        reject: (error: unknown) => void
      }
    | undefined
  let closed: { ok: true } | { ok: false; error: unknown } | undefined

  function take(): T {
    const entry = entries.shift() as Entry<T>
    buffered -= entry.size
    if (paused && buffered <= highWaterMark / 2) {
      paused = false
      options.onResume?.()
    }
    return entry.value
  }

  function release(): void {
    if (!paused) {
      return
    }
    paused = false
    options.onResume?.()
  }

  function settleWaiter(): void {
    if (pending === undefined) {
      return
    }
    if (entries.length > 0) {
      const resolve = pending.resolve
      pending = undefined
      resolve({ done: false, value: take() })
      return
    }
    if (closed === undefined) {
      return
    }
    if (closed.ok) {
      const resolve = pending.resolve
      pending = undefined
      resolve({ done: true, value: undefined })
      return
    }
    const reject = pending.reject
    pending = undefined
    reject(closed.error)
  }

  return {
    push(value, size = 1) {
      if (closed !== undefined) {
        return
      }
      entries.push({ value, size })
      buffered += size
      settleWaiter()
      if (!paused && buffered > highWaterMark) {
        paused = true
        options.onPause?.()
      }
    },
    end() {
      if (closed !== undefined) {
        return
      }
      closed = { ok: true }
      settleWaiter()
      release()
    },
    fail(error) {
      if (closed !== undefined) {
        return
      }
      closed = { ok: false, error }
      settleWaiter()
      release()
    },
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (entries.length > 0) {
            return Promise.resolve({ done: false, value: take() })
          }
          if (closed !== undefined) {
            if (closed.ok) {
              return Promise.resolve({ done: true, value: undefined })
            }
            return Promise.reject(closed.error)
          }
          return new Promise<IteratorResult<T>>((resolve, reject) => {
            pending = { resolve, reject }
          })
        },
      }
    },
  }
}
