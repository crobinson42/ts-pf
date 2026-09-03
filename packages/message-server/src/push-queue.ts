export type PushQueue<T> = AsyncIterable<T> & {
  push(value: T): void
  end(): void
}

export function createPushQueue<T>(): PushQueue<T> {
  const values: T[] = []
  let pending: ((result: IteratorResult<T>) => void) | undefined
  let ended = false

  function settleWaiter(): void {
    if (pending === undefined) {
      return
    }
    if (values.length > 0) {
      const value = values.shift() as T
      const resolve = pending
      pending = undefined
      resolve({ done: false, value })
      return
    }
    if (!ended) {
      return
    }
    const resolve = pending
    pending = undefined
    resolve({ done: true, value: undefined })
  }

  return {
    push(value) {
      if (ended) {
        return
      }
      values.push(value)
      settleWaiter()
    },
    end() {
      if (ended) {
        return
      }
      ended = true
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
          if (ended) {
            return Promise.resolve({ done: true, value: undefined })
          }
          return new Promise<IteratorResult<T>>((resolve) => {
            pending = resolve
          })
        },
      }
    },
  }
}
