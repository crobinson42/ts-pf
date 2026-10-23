import { describe, expect, it } from 'vitest'
import { createPushQueue } from '../src/push-queue.js'

describe('createPushQueue bounded', () => {
  it('fires onPause once above highWaterMark and onResume once drained to half', async () => {
    const events: string[] = []
    const queue = createPushQueue<number>({
      highWaterMark: 10,
      onPause: () => {
        events.push('pause')
      },
      onResume: () => {
        events.push('resume')
      },
    })
    queue.push(1, 4)
    queue.push(2, 4)
    expect(events).toEqual([])
    queue.push(3, 4) // 12 > 10
    queue.push(4, 4) // still paused, no second callback
    expect(events).toEqual(['pause'])

    const iterator = queue[Symbol.asyncIterator]()
    await iterator.next() // 12
    await iterator.next() // 8
    expect(events).toEqual(['pause'])
    await iterator.next() // 4 <= 5
    expect(events).toEqual(['pause', 'resume'])
    await iterator.next()
    queue.end()
  })

  it('counts 1 per push by default and never pauses at Infinity', () => {
    const events: string[] = []
    const bounded = createPushQueue<number>({
      highWaterMark: 2,
      onPause: () => {
        events.push('pause')
      },
    })
    bounded.push(1)
    bounded.push(2)
    expect(events).toEqual([])
    bounded.push(3)
    expect(events).toEqual(['pause'])

    const unbounded = createPushQueue<number>({
      highWaterMark: Infinity,
      onPause: () => {
        events.push('never')
      },
    })
    for (let i = 0; i < 1000; i++) {
      unbounded.push(i, 1_000_000)
    }
    expect(events).toEqual(['pause'])
  })

  it('a value handed straight to a pending next() does not count', async () => {
    const events: string[] = []
    const queue = createPushQueue<number>({
      highWaterMark: 0,
      onPause: () => {
        events.push('pause')
      },
    })
    const iterator = queue[Symbol.asyncIterator]()
    const pending = iterator.next()
    queue.push(1, 100)
    expect(await pending).toEqual({ done: false, value: 1 })
    expect(events).toEqual([])
    queue.push(2, 1)
    expect(events).toEqual(['pause'])
  })

  it('end() and fail() release a pause', () => {
    const events: string[] = []
    const opts = {
      highWaterMark: 1,
      onPause: () => {
        events.push('pause')
      },
      onResume: () => {
        events.push('resume')
      },
    }
    const ended = createPushQueue<number>(opts)
    ended.push(1, 5)
    ended.end()
    expect(events).toEqual(['pause', 'resume'])

    events.length = 0
    const failed = createPushQueue<number>(opts)
    failed.push(1, 5)
    failed.fail(new Error('x'))
    expect(events).toEqual(['pause', 'resume'])
  })
})
