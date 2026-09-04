import { isPFError } from '@ts-pf/protocol'
import { describe, expect, it } from 'vitest'
import { createMemoryDuplex } from '../src/duplex.js'
import { encodeFrame, type MessageFrame } from '../src/frame.js'
import { frameByteLength, MessageSession } from '../src/session.js'

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve)
  })
}

async function turns(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await nextTurn()
  }
}

function noopFrame(): (frame: MessageFrame) => void {
  return () => {}
}

describe('MessageSession', () => {
  it('client sends hello immediately; server default onHello replies hello-ok; both ready resolve', async () => {
    const { a, b } = createMemoryDuplex()
    const hellos: string[] = []
    const unsub = a.onMessage((text) => {
      hellos.push(text)
    })

    const server = new MessageSession({
      duplex: a,
      role: 'server',
      onFrame: noopFrame(),
    })
    const client = new MessageSession({
      duplex: b,
      role: 'client',
      onFrame: noopFrame(),
    })

    await nextTurn()
    expect(hellos).toEqual([encodeFrame({ type: 'hello', v: 1 })])
    unsub()

    await Promise.all([server.ready, client.ready])
  })

  it('call during delayed onHello sends Expected hello, closes, and abandons the factory', async () => {
    const { a, b } = createMemoryDuplex()
    const received: string[] = []
    const closes: unknown[] = []
    b.onMessage((text) => {
      received.push(text)
    })
    b.onClose((reason) => {
      closes.push(reason)
    })

    let factorySettledSuccess = false
    const hang = new Promise<void>(() => {})
    const server = new MessageSession({
      duplex: a,
      role: 'server',
      helloTimeoutMs: 0,
      onHello: async () => {
        await hang
        factorySettledSuccess = true
      },
      onFrame: noopFrame(),
    })
    const serverReady = expect(server.ready).rejects.toSatisfy(
      (error) => isPFError(error) && error.code === 'BAD_REQUEST',
    )

    b.send(encodeFrame({ type: 'hello', v: 1 }))
    await nextTurn()

    b.send(encodeFrame({ type: 'call', id: '1', path: ['planet'] }))
    await turns(2)

    expect(received).toEqual([
      encodeFrame({
        type: 'hello-error',
        error: { code: 'BAD_REQUEST', message: 'Expected hello' },
      }),
    ])
    await nextTurn()
    expect(closes).toHaveLength(1)
    expect(factorySettledSuccess).toBe(false)
    await serverReady
  })

  it('onHello throw sends hello-error INTERNAL without leaking the throw message, then closes', async () => {
    const { a, b } = createMemoryDuplex()
    const server = new MessageSession({
      duplex: a,
      role: 'server',
      onHello: () => {
        throw new Error('secret sauce')
      },
      onFrame: noopFrame(),
    })
    const serverReady = server.ready.then(
      () => {
        throw new Error('server ready should reject')
      },
      (reason: unknown) => reason,
    )
    const client = new MessageSession({
      duplex: b,
      role: 'client',
      onFrame: noopFrame(),
    })

    const error = await client.ready.then(
      () => {
        throw new Error('client ready should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isPFError(error)).toBe(true)
    if (!isPFError(error)) {
      throw new Error('expected PFError')
    }
    expect(error.code).toBe('INTERNAL')
    expect(error.status).toBe(400)
    expect(error.message).toBe('Internal server error')
    expect(error.message).not.toContain('secret')

    const serverError = await serverReady
    expect(isPFError(serverError)).toBe(true)
    if (!isPFError(serverError)) {
      throw new Error('expected PFError')
    }
    expect(serverError.code).toBe('INTERNAL')
    expect(serverError.message).toBe('Internal server error')
  })

  it('version mismatch hello v: 2 sends hello-error BAD_REQUEST then closes', async () => {
    const { a, b } = createMemoryDuplex()
    const received: string[] = []
    b.onMessage((text) => {
      received.push(text)
    })
    const server = new MessageSession({
      duplex: a,
      role: 'server',
      onFrame: noopFrame(),
    })
    const serverReady = expect(server.ready).rejects.toSatisfy(
      (error) => isPFError(error) && error.code === 'BAD_REQUEST',
    )

    b.send('{"type":"hello","v":2}')
    await turns(2)

    expect(received).toEqual([
      encodeFrame({
        type: 'hello-error',
        error: {
          code: 'BAD_REQUEST',
          message: 'Unsupported protocol version',
        },
      }),
    ])
    await serverReady
  })

  it('hello with v: "1" in waiting-hello sends hello-error BAD_REQUEST, not silent close', async () => {
    const { a, b } = createMemoryDuplex()
    const received: string[] = []
    b.onMessage((text) => {
      received.push(text)
    })
    const server = new MessageSession({
      duplex: a,
      role: 'server',
      onFrame: noopFrame(),
    })
    const serverReady = expect(server.ready).rejects.toSatisfy(
      (error) => isPFError(error) && error.code === 'BAD_REQUEST',
    )

    b.send('{"type":"hello","v":"1"}')
    await turns(2)

    expect(received).toEqual([
      encodeFrame({
        type: 'hello-error',
        error: { code: 'BAD_REQUEST', message: 'Invalid hello' },
      }),
    ])
    await serverReady
  })

  it('unparseable text closes with no hello-error sent', async () => {
    const { a, b } = createMemoryDuplex()
    const received: string[] = []
    const closes: unknown[] = []
    b.onMessage((text) => {
      received.push(text)
    })
    b.onClose((reason) => {
      closes.push(reason)
    })
    const server = new MessageSession({
      duplex: a,
      role: 'server',
      onFrame: noopFrame(),
    })
    const serverReady = expect(server.ready).rejects.toBeTruthy()

    b.send('{')
    await turns(2)

    expect(received).toEqual([])
    expect(closes).toHaveLength(1)
    await serverReady
  })

  it('inbound over-limit closes without parsing or sending PAYLOAD_TOO_LARGE', async () => {
    const { a, b } = createMemoryDuplex()
    const received: string[] = []
    const closes: unknown[] = []
    b.onMessage((text) => {
      received.push(text)
    })
    b.onClose((reason) => {
      closes.push(reason)
    })
    const server = new MessageSession({
      duplex: a,
      role: 'server',
      maxFrameBytes: 8,
      onFrame: noopFrame(),
    })
    const serverReady = expect(server.ready).rejects.toBeTruthy()

    const hello = encodeFrame({ type: 'hello', v: 1 })
    expect(frameByteLength(hello)).toBeGreaterThan(8)
    b.send(hello)
    await turns(2)

    expect(received).toEqual([])
    expect(closes).toHaveLength(1)
    expect(received.some((text) => text.includes('PAYLOAD_TOO_LARGE'))).toBe(
      false,
    )
    await serverReady
  })

  it('send of a huge frame with maxFrameBytes returns oversize and peer receives nothing', async () => {
    const { a, b } = createMemoryDuplex()
    const received: string[] = []
    b.onMessage((text) => {
      received.push(text)
    })
    const server = new MessageSession({
      duplex: a,
      role: 'server',
      maxFrameBytes: 32,
      helloTimeoutMs: 0,
      onFrame: noopFrame(),
    })

    const frame: MessageFrame = {
      type: 'call',
      id: '1',
      path: ['planet', 'find'],
      input: { name: 'this-is-too-large-for-the-limit' },
    }
    expect(frameByteLength(frame)).toBeGreaterThan(32)
    expect(server.send(frame)).toEqual({ ok: false, reason: 'oversize' })
    await nextTurn()
    expect(received).toEqual([])
    expect(received.some((text) => text.includes('PAYLOAD_TOO_LARGE'))).toBe(
      false,
    )
  })

  it('send of a cyclic object returns stringify', () => {
    const { a } = createMemoryDuplex()
    const session = new MessageSession({
      duplex: a,
      role: 'server',
      helloTimeoutMs: 0,
      onFrame: noopFrame(),
    })
    const cycle: { self?: unknown } = {}
    cycle.self = cycle
    expect(session.send({ type: 'hello', v: 1, meta: cycle })).toEqual({
      ok: false,
      reason: 'stringify',
    })
  })

  it('after ready, a second onFrame is delivered before the first onFrame promise settles', async () => {
    const { a, b } = createMemoryDuplex()
    const received: MessageFrame[] = []
    let resolveFirst!: () => void
    const firstWork = new Promise<void>((resolve) => {
      resolveFirst = resolve
    })
    let firstSettled = false

    const server = new MessageSession({
      duplex: a,
      role: 'server',
      onFrame: (frame) => {
        received.push(frame)
        if (received.length === 1) {
          void firstWork.then(() => {
            firstSettled = true
          })
          return
        }
      },
    })
    const client = new MessageSession({
      duplex: b,
      role: 'client',
      onFrame: noopFrame(),
    })
    await Promise.all([server.ready, client.ready])

    expect(client.send({ type: 'call', id: '1', path: ['a'] }).ok).toBe(true)
    expect(client.send({ type: 'call', id: '2', path: ['b'] }).ok).toBe(true)
    await turns(2)

    expect(received).toEqual([
      { type: 'call', id: '1', path: ['a'] },
      { type: 'call', id: '2', path: ['b'] },
    ])
    expect(firstSettled).toBe(false)
    resolveFirst()
    await firstWork
    expect(firstSettled).toBe(true)
  })

  it('hello timeout rejects ready with Network error', async () => {
    const { a } = createMemoryDuplex()
    const client = new MessageSession({
      duplex: a,
      role: 'client',
      helloTimeoutMs: 20,
      onFrame: noopFrame(),
    })

    const error = await client.ready.then(
      () => {
        throw new Error('ready should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isPFError(error)).toBe(true)
    if (!isPFError(error)) {
      throw new Error('expected PFError')
    }
    expect(error.message).toBe('Network error')
    expect(error.status).toBe(0)
    expect(error.code).toBe('INTERNAL')
  })

  it('after ready, decode failure with an id calls onInvalidFrame and does not close', async () => {
    const { a, b } = createMemoryDuplex()
    const invalid: Array<{ id: string; message: string }> = []
    const received: MessageFrame[] = []
    const server = new MessageSession({
      duplex: a,
      role: 'server',
      onFrame: (frame) => {
        received.push(frame)
      },
      onInvalidFrame: (info) => {
        invalid.push(info)
      },
    })
    const client = new MessageSession({
      duplex: b,
      role: 'client',
      onFrame: noopFrame(),
    })
    await Promise.all([server.ready, client.ready])

    b.send('{"type":"call","id":"9","path":["planet"],"nope":true}')
    await turns(2)

    expect(invalid).toEqual([{ id: '9', message: 'Unexpected key nope' }])
    expect(received).toEqual([])

    expect(client.send({ type: 'call', id: '1', path: ['planet'] }).ok).toBe(
      true,
    )
    await turns(2)
    expect(received).toEqual([{ type: 'call', id: '1', path: ['planet'] }])
  })

  it('client helloMeta appears on server onHello argument', async () => {
    const { a, b } = createMemoryDuplex()
    const metas: unknown[] = []
    const server = new MessageSession({
      duplex: a,
      role: 'server',
      onHello: (meta) => {
        metas.push(meta)
      },
      onFrame: noopFrame(),
    })
    const client = new MessageSession({
      duplex: b,
      role: 'client',
      helloMeta: { token: 'x' },
      onFrame: noopFrame(),
    })

    await Promise.all([server.ready, client.ready])
    expect(metas).toEqual([{ token: 'x' }])
  })
})
