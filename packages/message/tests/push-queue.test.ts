import { describe, expect, it } from 'vitest'
import { createPushQueue } from '../src/push-queue.js'

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const value of iterable) {
    out.push(value)
  }
  return out
}

describe('createPushQueue', () => {
  it('yields buffered values in order and completes on end()', async () => {
    const queue = createPushQueue<number>()
    queue.push(1)
    queue.push(2)
    queue.end()
    expect(await collect(queue)).toEqual([1, 2])
  })

  it('settles a pending next() when a value arrives', async () => {
    const queue = createPushQueue<string>()
    const iterator = queue[Symbol.asyncIterator]()
    const pending = iterator.next()
    queue.push('a')
    expect(await pending).toEqual({ done: false, value: 'a' })
    queue.end()
    expect(await iterator.next()).toEqual({ done: true, value: undefined })
  })

  it('rejects the pull after the buffered values on fail()', async () => {
    const queue = createPushQueue<number>()
    const error = new Error('boom')
    queue.push(1)
    queue.fail(error)
    const iterator = queue[Symbol.asyncIterator]()
    expect(await iterator.next()).toEqual({ done: false, value: 1 })
    await expect(iterator.next()).rejects.toBe(error)
  })

  it('rejects a pending next() on fail()', async () => {
    const queue = createPushQueue<number>()
    const iterator = queue[Symbol.asyncIterator]()
    const pending = iterator.next()
    const error = new Error('closed')
    queue.fail(error)
    await expect(pending).rejects.toBe(error)
  })

  it('ignores push, end, and fail after close', async () => {
    const queue = createPushQueue<number>()
    queue.push(1)
    queue.end()
    queue.push(2)
    queue.fail(new Error('late'))
    expect(await collect(queue)).toEqual([1])

    const failed = createPushQueue<number>()
    const error = new Error('first')
    failed.fail(error)
    failed.end()
    failed.push(3)
    await expect(failed[Symbol.asyncIterator]().next()).rejects.toBe(error)
  })
})
