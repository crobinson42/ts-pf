import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createStdioDuplex } from '../src/stdio.js'

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function waitUntil(pred: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (pred()) {
      return
    }
    await nextTurn()
  }
  throw new Error('timed out waiting for condition')
}

describe('createStdioDuplex backpressure', () => {
  it('send returns a drain promise when write() is refused and resolves on drain', async () => {
    const input = new PassThrough()
    const output = new PassThrough({ highWaterMark: 8 })
    const duplex = createStdioDuplex({ input, output })

    const drained = duplex.send('x'.repeat(32))
    expect(drained).toBeInstanceOf(Promise)
    let settled = false
    void drained?.then(() => {
      settled = true
    })
    await nextTurn()
    expect(settled).toBe(false)

    output.resume() // a reader appears: the Writable drains
    await waitUntil(() => settled)
    expect(duplex.send('y')).toBeUndefined()
    duplex.close()
  })

  it('a pending drain promise resolves on close', async () => {
    const input = new PassThrough()
    const output = new PassThrough({ highWaterMark: 8 })
    const duplex = createStdioDuplex({ input, output })
    const drained = duplex.send('x'.repeat(32))
    let settled = false
    void drained?.then(() => {
      settled = true
    })
    duplex.close()
    await waitUntil(() => settled)
    expect(settled).toBe(true)
  })

  it('pause stops input delivery until resume', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const duplex = createStdioDuplex({ input, output })
    const received: string[] = []
    duplex.onMessage((text) => {
      received.push(text)
    })

    duplex.pause?.()
    input.write('held\n')
    await nextTurn()
    await nextTurn()
    expect(received).toEqual([])

    duplex.resume?.()
    await waitUntil(() => received.length === 1)
    expect(received).toEqual(['held'])
    duplex.close()
  })
})
