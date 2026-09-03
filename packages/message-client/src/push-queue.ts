export type PushQueue<T> = AsyncIterable<T> & {
  push(value: T): void
  end(): void
  fail(error: unknown): void
}

export function createPushQueue<T>(): PushQueue<T> {
  const values: T[] = []
  let pending:
    | {
        resolve: (result: IteratorResult<T>) => void
        reject: (error: unknown) => void
      }
    | undefined
  let closed: { ok: true } | { ok: false; error: unknown } | undefined

  function settleWaiter(): void {
    if (pending === undefined) {
      return
    }
    if (values.length > 0) {
      const value = values.shift() as T
      const resolve = pending.resolve
      pending = undefined
      resolve({ done: false, value })
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
    push(value) {
      if (closed !== undefined) {
        return
      }
      values.push(value)
      settleWaiter()
    },
    end() {
      if (closed !== undefined) {
        return
      }
      closed = { ok: true }
      settleWaiter()
    },
    fail(error) {
      if (closed !== undefined) {
        return
      }
      closed = { ok: false, error }
      settleWaiter()
    },
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (values.length > 0) {
            return Promise.resolve({
              done: false,
              value: values.shift() as T,
            })
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
