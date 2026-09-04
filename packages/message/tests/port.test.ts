import { describe, expect, it } from 'vitest'
import { createPortDuplex } from '../src/port.js'

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function waitUntil(pred: () => boolean): Promise<void> {
  for (let i = 0; i < 80; i++) {
    if (pred()) {
      return
    }
    await nextTurn()
  }
  throw new Error('timed out waiting for condition')
}

describe('createPortDuplex', () => {
  it('is exported from the package index and stdio is not', async () => {
    const exported = await import('../src/index.js')
    expect(exported).toHaveProperty('createPortDuplex')
    expect(exported).toHaveProperty('createWsDuplex')
    expect(exported).toHaveProperty('createMemoryDuplex')
    expect(exported).not.toHaveProperty('createStdioDuplex')
  })

  it('delivers string messages and ignores send after close', async () => {
    const { port1, port2 } = new MessageChannel()
    const a = createPortDuplex(port1)
    const received: string[] = []
    const b = createPortDuplex(port2)
    b.onMessage((text) => {
      received.push(text)
    })
    port1.start()
    port2.start()

    a.send('hello')
    await waitUntil(() => received.length > 0)
    expect(received).toEqual(['hello'])

    a.close()
    a.send('after')
    await nextTurn()
    expect(received).toEqual(['hello'])

    b.close()
  })

  it('closes on a non-string message', async () => {
    const { port1, port2 } = new MessageChannel()
    const a = createPortDuplex(port1)
    let closed = false
    a.onMessage(() => {
      throw new Error('must not parse non-string')
    })
    a.onClose(() => {
      closed = true
    })
    port1.start()
    port2.start()

    port2.postMessage(1)
    await waitUntil(() => closed)
    expect(closed).toBe(true)
  })
})
