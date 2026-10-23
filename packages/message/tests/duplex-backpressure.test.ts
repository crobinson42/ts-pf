import { describe, expect, it } from 'vitest'
import { createMemoryDuplex } from '../src/duplex.js'

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve)
  })
}

describe('createMemoryDuplex backpressure', () => {
  it('send is synchronous without a highWaterMark', () => {
    const { a } = createMemoryDuplex()
    expect(a.send('x'.repeat(10_000))).toBeUndefined()
    a.close()
  })

  it('pause holds delivery and resume releases it in order', async () => {
    const { a, b } = createMemoryDuplex()
    const received: string[] = []
    b.onMessage((text) => {
      received.push(text)
    })

    b.pause?.()
    a.send('one')
    a.send('two')
    await nextTurn()
    await nextTurn()
    expect(received).toEqual([])

    b.resume?.()
    await nextTurn()
    expect(received).toEqual(['one', 'two'])
    a.close()
  })

  it('send returns a drain promise above the mark that resolves once delivered', async () => {
    const { a, b } = createMemoryDuplex({ highWaterMark: 5 })
    const received: string[] = []
    b.onMessage((text) => {
      received.push(text)
    })

    b.pause?.()
    expect(a.send('abc')).toBeUndefined()
    const drained = a.send('defg')
    expect(drained).toBeInstanceOf(Promise)
    let settled = false
    void drained?.then(() => {
      settled = true
    })
    await nextTurn()
    await nextTurn()
    expect(settled).toBe(false)

    b.resume?.()
    await nextTurn()
    await nextTurn()
    expect(received).toEqual(['abc', 'defg'])
    expect(settled).toBe(true)
    a.close()
  })

  it('a pending drain promise resolves on close', async () => {
    const { a, b } = createMemoryDuplex({ highWaterMark: 1 })
    b.pause?.()
    const drained = a.send('too long')
    let settled = false
    void drained?.then(() => {
      settled = true
    })
    a.close()
    await nextTurn()
    await nextTurn()
    expect(settled).toBe(true)
  })

  it('resume after close does not deliver', async () => {
    const { a, b } = createMemoryDuplex()
    const received: string[] = []
    b.onMessage((text) => {
      received.push(text)
    })
    b.pause?.()
    a.send('held')
    a.close()
    await nextTurn()
    await nextTurn()
    b.resume?.()
    await nextTurn()
    await nextTurn()
    expect(received).toEqual([])
  })
})
