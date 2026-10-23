import { describe, expect, it } from 'vitest'
import { createMemoryDuplex, type Duplex } from '../src/duplex.js'
import { encodeFrame, type MessageFrame } from '../src/frame.js'
import { MessageSession } from '../src/session.js'

function turns(n: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number): void => {
      if (left === 0) {
        resolve()
        return
      }
      queueMicrotask(() => {
        step(left - 1)
      })
    }
    step(n)
  })
}

/** A duplex whose `send` returns whatever the test puts in `nextSend`. */
function scriptedDuplex(): {
  duplex: Duplex
  script: { nextSend: void | Promise<void> }
  closes: unknown[]
} {
  const closes: unknown[] = []
  const closeHandlers = new Set<(reason?: unknown) => void>()
  const script: { nextSend: void | Promise<void> } = { nextSend: undefined }
  const duplex: Duplex = {
    send: () => script.nextSend,
    onMessage: () => () => {},
    onClose: (handler) => {
      closeHandlers.add(handler)
      return () => {
        closeHandlers.delete(handler)
      }
    },
    close: (reason) => {
      closes.push(reason)
      for (const handler of closeHandlers) {
        handler(reason)
      }
    },
  }
  return { duplex, script, closes }
}

/** A server session with no peer hello; `ready` rejects on close, which these tests expect. */
function serverSession(
  duplex: Duplex,
  onClose?: (reason?: unknown) => void,
): MessageSession {
  const session = new MessageSession({
    duplex,
    role: 'server',
    onFrame: () => {},
    ...(onClose !== undefined ? { onClose } : {}),
  })
  void session.ready.catch(() => {})
  return session
}

describe('MessageSession send drain', () => {
  it('omits drained when the duplex send is synchronous', () => {
    const { duplex } = scriptedDuplex()
    const session = serverSession(duplex)
    const sent = session.send({ type: 'done', id: '1' })
    expect(sent).toEqual({ ok: true })
    expect('drained' in sent).toBe(false)
    session.close()
  })

  it('exposes the duplex drain promise and resolves when it resolves', async () => {
    const { duplex, script } = scriptedDuplex()
    const session = serverSession(duplex)
    let release!: () => void
    script.nextSend = new Promise<void>((resolve) => {
      release = resolve
    })
    const sent = session.send({ type: 'item', id: '1', output: 1 })
    expect(sent.ok).toBe(true)
    if (!sent.ok) {
      return
    }
    expect(sent.drained).toBeInstanceOf(Promise)
    let settled = false
    void sent.drained?.then(() => {
      settled = true
    })
    await turns(3)
    expect(settled).toBe(false)
    release()
    await turns(3)
    expect(settled).toBe(true)
    session.close()
  })

  it('resolves a pending drain when the session closes', async () => {
    const { duplex, script } = scriptedDuplex()
    const session = serverSession(duplex)
    script.nextSend = new Promise<void>(() => {})
    const sent = session.send({ type: 'item', id: '1', output: 1 })
    if (!sent.ok) {
      throw new Error('send failed')
    }
    let settled = false
    void sent.drained?.then(() => {
      settled = true
    })
    session.close()
    await turns(3)
    expect(settled).toBe(true)
  })

  it('resolves a pending drain when the duplex closes underneath', async () => {
    const { duplex, script } = scriptedDuplex()
    const session = serverSession(duplex)
    script.nextSend = new Promise<void>(() => {})
    const sent = session.send({ type: 'item', id: '1', output: 1 })
    if (!sent.ok) {
      throw new Error('send failed')
    }
    let settled = false
    void sent.drained?.then(() => {
      settled = true
    })
    duplex.close('peer gone')
    await turns(3)
    expect(settled).toBe(true)
  })

  it('a rejected drain closes the session with that reason and still resolves', async () => {
    const { duplex, script, closes } = scriptedDuplex()
    const reasons: unknown[] = []
    const session = serverSession(duplex, (reason) => {
      reasons.push(reason)
    })
    const boom = new Error('socket write failed')
    script.nextSend = Promise.reject(boom)
    const sent = session.send({ type: 'item', id: '1', output: 1 })
    if (!sent.ok) {
      throw new Error('send failed')
    }
    await sent.drained
    expect(closes).toEqual([boom])
    expect(reasons).toEqual([boom])
    expect(session.send({ type: 'done', id: '1' })).toEqual({
      ok: false,
      reason: 'closed',
    })
  })

  it('onFrame receives the frame text length as size', async () => {
    const { a, b } = createMemoryDuplex()
    const seen: { frame: MessageFrame; size: number }[] = []
    const server = new MessageSession({
      duplex: a,
      role: 'server',
      onFrame: (frame, size) => {
        seen.push({ frame, size })
      },
    })
    const client = new MessageSession({
      duplex: b,
      role: 'client',
      onFrame: () => {},
    })
    await Promise.all([server.ready, client.ready])

    const frame: MessageFrame = {
      type: 'in-item',
      id: '1',
      input: { pad: 'x'.repeat(40) },
    }
    expect(client.send(frame).ok).toBe(true)
    await turns(3)
    expect(seen).toEqual([{ frame, size: encodeFrame(frame).length }])
    server.close()
  })
})
