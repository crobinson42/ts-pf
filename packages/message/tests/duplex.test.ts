import { describe, expect, it } from 'vitest'
import { createMemoryDuplex } from '../src/duplex.js'

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve)
  })
}

describe('createMemoryDuplex', () => {
  it('delivers a.send to b.onMessage on a later turn', async () => {
    const { a, b } = createMemoryDuplex()
    const received: string[] = []
    b.onMessage((text) => {
      received.push(text)
    })

    a.send('hello')
    expect(received).toEqual([])

    await nextTurn()
    expect(received).toEqual(['hello'])
  })

  it('delivers b.send to a.onMessage on a later turn', async () => {
    const { a, b } = createMemoryDuplex()
    const received: string[] = []
    a.onMessage((text) => {
      received.push(text)
    })

    b.send('from-b')
    expect(received).toEqual([])

    await nextTurn()
    expect(received).toEqual(['from-b'])
  })

  it('does not re-enter the current onMessage when send is called from a handler', async () => {
    const { a, b } = createMemoryDuplex()
    const log: string[] = []

    b.onMessage((text) => {
      log.push(`start:${text}`)
      if (text === 'ping') {
        a.send('pong')
        expect(log).toEqual(['start:ping'])
      }
      log.push(`end:${text}`)
    })

    a.send('ping')
    expect(log).toEqual([])

    await nextTurn()
    expect(log).toEqual(['start:ping', 'end:ping', 'start:pong', 'end:pong'])
  })

  it('close fires onClose on both ends with the reason', async () => {
    const { a, b } = createMemoryDuplex()
    const aReasons: unknown[] = []
    const bReasons: unknown[] = []
    a.onClose((reason) => {
      aReasons.push(reason)
    })
    b.onClose((reason) => {
      bReasons.push(reason)
    })

    a.close('gone')
    expect(aReasons).toEqual([])
    expect(bReasons).toEqual([])

    await nextTurn()
    expect(aReasons).toEqual(['gone'])
    expect(bReasons).toEqual(['gone'])
  })

  it('close without a reason still fires onClose', async () => {
    const { a, b } = createMemoryDuplex()
    const seen: unknown[] = []
    b.onClose((reason) => {
      seen.push(reason)
    })

    a.close()
    expect(seen).toEqual([])

    await nextTurn()
    expect(seen).toEqual([undefined])
  })

  it('does not re-enter the current onMessage when close is called from a handler', async () => {
    const { a, b } = createMemoryDuplex()
    const log: string[] = []

    b.onMessage((text) => {
      log.push(`msg:${text}`)
      a.close('from-handler')
      expect(log).toEqual([`msg:${text}`])
    })
    b.onClose((reason) => {
      log.push(`close:${String(reason)}`)
    })

    a.send('hello')
    expect(log).toEqual([])

    await nextTurn()
    expect(log).toEqual(['msg:hello', 'close:from-handler'])
  })

  it('unsubscribing onMessage stops delivery', async () => {
    const { a, b } = createMemoryDuplex()
    const received: string[] = []
    const unsubscribe = b.onMessage((text) => {
      received.push(text)
    })

    unsubscribe()
    a.send('nope')
    await nextTurn()
    expect(received).toEqual([])
  })

  it('unsubscribing onClose stops delivery', async () => {
    const { a, b } = createMemoryDuplex()
    const reasons: unknown[] = []
    const unsubscribe = b.onClose((reason) => {
      reasons.push(reason)
    })

    unsubscribe()
    a.close('gone')
    await nextTurn()
    expect(reasons).toEqual([])
  })

  it('send after close does not deliver', async () => {
    const { a, b } = createMemoryDuplex()
    const fromA: string[] = []
    const fromB: string[] = []
    b.onMessage((text) => {
      fromA.push(text)
    })
    a.onMessage((text) => {
      fromB.push(text)
    })

    a.close()
    a.send('after-a-close')
    b.send('after-b-close')
    await nextTurn()
    expect(fromA).toEqual([])
    expect(fromB).toEqual([])
  })

  it('delivers a queued send before onClose when send then close', async () => {
    const { a, b } = createMemoryDuplex()
    const log: string[] = []
    b.onMessage((text) => {
      log.push(text)
    })
    b.onClose(() => {
      log.push('close')
    })

    a.send('hello-error')
    a.close()
    expect(log).toEqual([])

    await nextTurn()
    expect(log).toEqual(['hello-error', 'close'])
  })

  it('second close is a no-op', async () => {
    const { a, b } = createMemoryDuplex()
    let closes = 0
    a.onClose(() => {
      closes += 1
    })
    b.onClose(() => {
      closes += 1
    })

    a.close('first')
    b.close('second')
    a.close()
    expect(closes).toBe(0)

    await nextTurn()
    expect(closes).toBe(2)
  })
})
