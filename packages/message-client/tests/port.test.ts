import type { Link } from '@ts-pf/client'
import { isLocalFailure } from '@ts-pf/client'
import {
  type Duplex,
  frameByteLength,
  type MessageFrame,
  MessageSession,
} from '@ts-pf/message'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { PortLink } from '../src/index.js'

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function waitFor(
  frames: MessageFrame[],
  pred: (frame: MessageFrame) => boolean,
): Promise<MessageFrame> {
  for (let i = 0; i < 80; i++) {
    const found = frames.find(pred)
    if (found) {
      return found
    }
    await nextTurn()
  }
  throw new Error(`timed out waiting for frame: ${JSON.stringify(frames)}`)
}

function portDuplex(port: MessagePort): Duplex {
  const closeHandlers = new Set<(reason?: unknown) => void>()
  let closed = false

  const close = (reason?: unknown): void => {
    if (closed) {
      return
    }
    closed = true
    try {
      port.close()
    } catch {
      // already disconnected
    }
    for (const handler of [...closeHandlers]) {
      if (reason === undefined) {
        handler()
      } else {
        handler(reason)
      }
    }
  }

  return {
    send(text) {
      if (closed) {
        return
      }
      port.postMessage(text)
    },
    onMessage(handler) {
      const listener = (event: MessageEvent) => {
        if (typeof event.data !== 'string') {
          close()
          return
        }
        handler(event.data)
      }
      port.addEventListener('message', listener)
      return () => {
        port.removeEventListener('message', listener)
      }
    },
    onClose(handler) {
      closeHandlers.add(handler)
      return () => {
        closeHandlers.delete(handler)
      }
    },
    close,
  }
}

function openPeer(
  port: MessagePort,
  options: {
    onHello?: (meta?: unknown) => void | Promise<void>
    helloTimeoutMs?: number
  } = {},
): { session: MessageSession; frames: MessageFrame[] } {
  const frames: MessageFrame[] = []
  const sessionOpts: ConstructorParameters<typeof MessageSession>[0] = {
    duplex: portDuplex(port),
    role: 'server',
    onFrame: (frame) => {
      frames.push(frame)
    },
  }
  if (options.onHello !== undefined) {
    sessionOpts.onHello = options.onHello
  }
  if (options.helloTimeoutMs !== undefined) {
    sessionOpts.helloTimeoutMs = options.helloTimeoutMs
  }
  const session = new MessageSession(sessionOpts)
  port.start()
  return { session, frames }
}

describe('PortLink', () => {
  it('exports PortLink and not StdioLink or attachClient', async () => {
    const exported = await import('../src/index.js')
    expect(Object.keys(exported).sort()).toEqual(['PortLink', 'WsLink'])
    expect(exported).not.toHaveProperty('StdioLink')
    expect(exported).not.toHaveProperty('attachClient')
    expect(exported).not.toHaveProperty('RPCLink')
  })

  it('implements Link without widening it with close', () => {
    expectTypeOf<PortLink>().toMatchTypeOf<Link>()
    expectTypeOf<Link>().not.toHaveProperty('close')
    expectTypeOf<PortLink['close']>().toBeFunction()
  })

  it('sends hello at construct and roundtrips a unary call over JSON strings', async () => {
    const { port1, port2 } = new MessageChannel()
    const inbound: unknown[] = []
    port1.addEventListener('message', (event) => {
      inbound.push(event.data)
    })
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    const pending = link.call(['planet', 'find'], { id: 1 })
    const call = await waitFor(
      peer.frames,
      (frame) => frame.type === 'call' && frame.id === '1',
    )
    expect(call).toEqual({
      type: 'call',
      id: '1',
      path: ['planet', 'find'],
      input: { id: 1 },
    })
    expect(
      peer.session.send({
        type: 'result',
        id: '1',
        ok: true,
        output: { id: 1, name: 'Earth' },
      }).ok,
    ).toBe(true)
    expect(await pending).toEqual({ id: 1, name: 'Earth' })
    expect(inbound.length).toBeGreaterThan(0)
    expect(inbound.every((data) => typeof data === 'string')).toBe(true)

    link.close()
    peer.session.close()
  })

  it('omits input when undefined and resolves omitted output as undefined', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    const pending = link.call(['planet', 'list'], undefined)
    const call = await waitFor(peer.frames, (frame) => frame.type === 'call')
    expect(call).toEqual({
      type: 'call',
      id: '1',
      path: ['planet', 'list'],
    })
    expect('input' in call).toBe(false)
    expect(peer.session.send({ type: 'result', id: '1', ok: true }).ok).toBe(
      true,
    )
    expect(await pending).toBeUndefined()

    link.close()
    peer.session.close()
  })

  it('assigns monotonic string ids', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    const first = link.call(['a'], 1)
    const second = link.call(['b'], 2)
    const call1 = await waitFor(
      peer.frames,
      (frame) => frame.type === 'call' && frame.id === '1',
    )
    const call2 = await waitFor(
      peer.frames,
      (frame) => frame.type === 'call' && frame.id === '2',
    )
    expect(call1).toMatchObject({ type: 'call', path: ['a'] })
    expect(call2).toMatchObject({ type: 'call', path: ['b'] })
    expect(
      peer.session.send({ type: 'result', id: '1', ok: true, output: 'one' })
        .ok,
    ).toBe(true)
    expect(
      peer.session.send({ type: 'result', id: '2', ok: true, output: 'two' })
        .ok,
    ).toBe(true)
    expect(await first).toBe('one')
    expect(await second).toBe('two')

    link.close()
    peer.session.close()
  })

  it('passes hello meta to the peer', async () => {
    const { port1, port2 } = new MessageChannel()
    let seen: unknown
    const peer = openPeer(port1, {
      onHello: (meta) => {
        seen = meta
      },
    })
    const link = new PortLink({ port: port2, meta: { token: 't' } })
    await peer.session.ready
    expect(seen).toEqual({ token: 't' })
    link.close()
    peer.session.close()
  })

  it('rejects protocol errors via errorFromEnvelope', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    const pending = link.call(['planet', 'find'], { id: 7 })
    await waitFor(peer.frames, (frame) => frame.type === 'call')
    expect(
      peer.session.send({
        type: 'result',
        id: '1',
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'missing',
          data: { id: 7 },
        },
      }).ok,
    ).toBe(true)

    const error = await pending.then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isLocalFailure(error)).toBe(false)
    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      message: 'missing',
      data: { id: 7 },
    })

    link.close()
    peer.session.close()
  })

  it('aborts an in-flight call by sending cancel', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    const ac = new AbortController()
    const pending = link.call(['planet', 'find'], { id: 1 }, ac.signal)
    await waitFor(peer.frames, (frame) => frame.type === 'call')
    ac.abort()

    const error = await pending.then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isLocalFailure(error)).toBe(true)
    expect(error).toMatchObject({
      code: 'INTERNAL',
      status: 0,
      message: 'Request aborted',
    })
    const cancel = await waitFor(
      peer.frames,
      (frame) => frame.type === 'cancel',
    )
    expect(cancel).toEqual({ type: 'cancel', id: '1' })

    link.close()
    peer.session.close()
  })

  it('abort during hello does not send cancel or close the connection', async () => {
    const { port1, port2 } = new MessageChannel()
    let releaseHello!: () => void
    const helloGate = new Promise<void>((resolve) => {
      releaseHello = resolve
    })
    const peer = openPeer(port1, {
      onHello: () => helloGate,
      helloTimeoutMs: 0,
    })
    const link = new PortLink({ port: port2, helloTimeoutMs: 0 })
    const ac = new AbortController()
    const pending = link.call(['planet', 'find'], { id: 1 }, ac.signal)
    for (let i = 0; i < 10; i++) {
      await nextTurn()
    }
    ac.abort()

    const error = await pending.then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isLocalFailure(error)).toBe(true)
    expect(error).toMatchObject({ message: 'Request aborted' })
    expect(
      peer.frames.some(
        (frame) => frame.type === 'call' || frame.type === 'cancel',
      ),
    ).toBe(false)

    releaseHello()
    await peer.session.ready

    const later = link.call(['planet', 'find'], { id: 2 })
    const call = await waitFor(peer.frames, (frame) => frame.type === 'call')
    expect(call).toEqual({
      type: 'call',
      id: '1',
      path: ['planet', 'find'],
      input: { id: 2 },
    })
    expect(
      peer.session.send({
        type: 'result',
        id: '1',
        ok: true,
        output: { id: 2, name: 'Earth' },
      }).ok,
    ).toBe(true)
    expect(await later).toEqual({ id: 2, name: 'Earth' })

    link.close()
    peer.session.close()
  })

  it('ignores invalid in-flight frames and still accepts a later result', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    const pending = link.call(['planet', 'find'], { id: 1 })
    await waitFor(
      peer.frames,
      (frame) => frame.type === 'call' && frame.id === '1',
    )
    expect(peer.session.sendText('{"type":"nope","id":"1"}').ok).toBe(true)
    expect(
      peer.session.sendText(
        '{"type":"result","id":"1","ok":true,"output":{"id":1,"name":"bogus"},"nope":true}',
      ).ok,
    ).toBe(true)
    for (let i = 0; i < 20; i++) {
      await nextTurn()
    }
    const marker = await Promise.race([
      pending.then(
        () => 'settled' as const,
        () => 'settled' as const,
      ),
      nextTurn().then(() => 'pending' as const),
    ])
    expect(marker).toBe('pending')

    expect(
      peer.session.send({
        type: 'result',
        id: '1',
        ok: true,
        output: { id: 1, name: 'Earth' },
      }).ok,
    ).toBe(true)
    expect(await pending).toEqual({ id: 1, name: 'Earth' })

    link.close()
    peer.session.close()
  })

  it('first illegal frame is Invalid response for that call only', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    const bad = link.call(['planet', 'find'], { id: 1 })
    await waitFor(
      peer.frames,
      (frame) => frame.type === 'call' && frame.id === '1',
    )
    expect(
      peer.session.send({ type: 'in-item', id: '1', input: { chunk: 1 } }).ok,
    ).toBe(true)
    const badError = await bad.then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isLocalFailure(badError)).toBe(true)
    expect(badError).toMatchObject({
      code: 'INTERNAL',
      status: 0,
      message: 'Invalid response',
    })

    expect(
      peer.session.send({
        type: 'result',
        id: '1',
        ok: true,
        output: { ignored: true },
      }).ok,
    ).toBe(true)

    const good = link.call(['planet', 'find'], { id: 2 })
    await waitFor(
      peer.frames,
      (frame) => frame.type === 'call' && frame.id === '2',
    )
    expect(
      peer.session.send({
        type: 'result',
        id: '2',
        ok: true,
        output: { id: 2, name: 'Earth' },
      }).ok,
    ).toBe(true)
    expect(await good).toEqual({ id: 2, name: 'Earth' })

    link.close()
    peer.session.close()
  })

  it('resolves a first done frame to an empty async iterable', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    const pending = link.call(['planet', 'chat'], { prompt: 'hi' })
    await waitFor(peer.frames, (frame) => frame.type === 'call')
    expect(peer.session.send({ type: 'done', id: '1' }).ok).toBe(true)
    const tokens = await pending
    const collected: unknown[] = []
    for await (const item of tokens as AsyncIterable<unknown>) {
      collected.push(item)
    }
    expect(collected).toEqual([])

    link.close()
    peer.session.close()
  })

  it('resolves a first item frame to an async iterable', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    const pending = link.call(['planet', 'chat'], { prompt: 'hi' })
    await waitFor(peer.frames, (frame) => frame.type === 'call')
    expect(
      peer.session.send({
        type: 'item',
        id: '1',
        output: { token: 'a' },
      }).ok,
    ).toBe(true)
    const tokens = await pending
    expect(
      peer.session.send({
        type: 'item',
        id: '1',
        output: { token: 'b' },
      }).ok,
    ).toBe(true)
    expect(peer.session.send({ type: 'done', id: '1' }).ok).toBe(true)
    const collected: unknown[] = []
    for await (const item of tokens as AsyncIterable<unknown>) {
      collected.push(item)
    }
    expect(collected).toEqual([{ token: 'a' }, { token: 'b' }])

    link.close()
    peer.session.close()
  })

  it('rejects the iterator on mid-stream result ok false', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    const pending = link.call(['planet', 'chat'], { prompt: 'hi' })
    await waitFor(peer.frames, (frame) => frame.type === 'call')
    expect(
      peer.session.send({
        type: 'item',
        id: '1',
        output: { token: 'a' },
      }).ok,
    ).toBe(true)
    const tokens = (await pending) as AsyncIterable<unknown>
    const iter = tokens[Symbol.asyncIterator]()
    expect(await iter.next()).toEqual({
      done: false,
      value: { token: 'a' },
    })
    expect(
      peer.session.send({
        type: 'result',
        id: '1',
        ok: false,
        error: { code: 'NOT_FOUND', message: 'missing' },
      }).ok,
    ).toBe(true)
    const error = await iter.next().then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isLocalFailure(error)).toBe(false)
    expect(error).toMatchObject({ code: 'NOT_FOUND', message: 'missing' })
    expect(peer.frames.some((frame) => frame.type === 'cancel')).toBe(false)

    link.close()
    peer.session.close()
  })

  it('sends cancel not in-done when the output iterator returns', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    const pending = link.call(['planet', 'chat'], { prompt: 'hi' })
    await waitFor(peer.frames, (frame) => frame.type === 'call')
    expect(
      peer.session.send({
        type: 'item',
        id: '1',
        output: { token: 'a' },
      }).ok,
    ).toBe(true)
    const tokens = (await pending) as AsyncIterable<unknown>
    const iter = tokens[Symbol.asyncIterator]()
    expect(await iter.next()).toEqual({
      done: false,
      value: { token: 'a' },
    })
    await iter.return?.()
    const cancel = await waitFor(
      peer.frames,
      (frame) => frame.type === 'cancel',
    )
    expect(cancel).toEqual({ type: 'cancel', id: '1' })
    expect(peer.frames.some((frame) => frame.type === 'in-done')).toBe(false)

    link.close()
    peer.session.close()
  })

  it.each([
    { type: 'hello-ok' as const, v: 1 as const },
    {
      type: 'hello-error' as const,
      error: { code: 'BAD_REQUEST', message: 'nope' },
    },
  ])(
    'post-ready $type rejects inflight with Connection closed',
    async (frame) => {
      const { port1, port2 } = new MessageChannel()
      const peer = openPeer(port1)
      const link = new PortLink({ port: port2 })
      await peer.session.ready

      const pending = link.call(['planet', 'find'], { id: 1 })
      await waitFor(peer.frames, (f) => f.type === 'call')
      expect(peer.session.send(frame).ok).toBe(true)

      const error = await pending.then(
        () => {
          throw new Error('should reject')
        },
        (reason: unknown) => reason,
      )
      expect(isLocalFailure(error)).toBe(true)
      expect(error).toMatchObject({
        code: 'INTERNAL',
        status: 0,
        message: 'Connection closed',
      })
      link.close()
    },
  )

  it('rejects inflight calls when the peer port closes', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    const pending = link.call(['planet', 'find'], { id: 1 })
    await waitFor(peer.frames, (frame) => frame.type === 'call')
    port1.close()

    const error = await pending.then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isLocalFailure(error)).toBe(true)
    expect(error).toMatchObject({
      code: 'INTERNAL',
      status: 0,
      message: 'Connection closed',
    })
    link.close()
  })

  it('close rejects inflight and subsequent calls with Connection closed', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    const pending = link.call(['planet', 'find'], { id: 1 })
    await waitFor(peer.frames, (frame) => frame.type === 'call')
    link.close()
    link.close()

    const inflightError = await pending.then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isLocalFailure(inflightError)).toBe(true)
    expect(inflightError).toMatchObject({ message: 'Connection closed' })

    const laterError = await link.call(['planet', 'find'], { id: 1 }).then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isLocalFailure(laterError)).toBe(true)
    expect(laterError).toMatchObject({ message: 'Connection closed' })
    peer.session.close()
  })

  it('sends stream true and pumps in-item then in-done for AsyncIterable input', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    async function* chunks() {
      yield { chunk: 1 }
      yield { chunk: 2 }
    }

    const pending = link.call(['planet', 'ingest'], chunks())
    const call = await waitFor(
      peer.frames,
      (frame) => frame.type === 'call' && frame.id === '1',
    )
    expect(call).toEqual({
      type: 'call',
      id: '1',
      path: ['planet', 'ingest'],
      stream: true,
    })
    expect('input' in call).toBe(false)
    await waitFor(
      peer.frames,
      (frame) =>
        frame.type === 'in-item' &&
        frame.id === '1' &&
        (frame.input as { chunk: number }).chunk === 2,
    )
    expect(peer.frames.filter((frame) => frame.type === 'in-item')).toEqual([
      { type: 'in-item', id: '1', input: { chunk: 1 } },
      { type: 'in-item', id: '1', input: { chunk: 2 } },
    ])
    const done = await waitFor(peer.frames, (frame) => frame.type === 'in-done')
    expect(done).toEqual({ type: 'in-done', id: '1' })
    expect(
      peer.session.send({
        type: 'result',
        id: '1',
        ok: true,
        output: { count: 3 },
      }).ok,
    ).toBe(true)
    expect(await pending).toEqual({ count: 3 })

    link.close()
    peer.session.close()
  })

  it('sends cancel not in-done when the input generator throws', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    async function* chunks() {
      yield { chunk: 1 }
      throw new Error('input failed')
    }

    const pending = link.call(['planet', 'ingest'], chunks()).then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    await waitFor(
      peer.frames,
      (frame) => frame.type === 'in-item' && frame.id === '1',
    )
    const cancel = await waitFor(
      peer.frames,
      (frame) => frame.type === 'cancel',
    )
    expect(cancel).toEqual({ type: 'cancel', id: '1' })
    expect(peer.frames.some((frame) => frame.type === 'in-done')).toBe(false)
    const error = await pending
    expect(isLocalFailure(error)).toBe(true)
    expect(error).toMatchObject({ message: 'input failed' })

    link.close()
    peer.session.close()
  })

  it('rejects an oversize call with PAYLOAD_TOO_LARGE', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const input = { blob: 'x'.repeat(200) }
    const callFrame = {
      type: 'call' as const,
      id: '1',
      path: ['planet', 'find'],
      input,
    }
    const maxFrameBytes = 80
    expect(frameByteLength(callFrame)).toBeGreaterThan(maxFrameBytes)
    const link = new PortLink({ port: port2, maxFrameBytes })
    await peer.session.ready

    const error = await link.call(['planet', 'find'], input).then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isLocalFailure(error)).toBe(false)
    expect(error).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      status: 413,
      message: 'Frame too large',
    })
    expect(peer.frames.filter((frame) => frame.type === 'call')).toEqual([])

    link.close()
    peer.session.close()
  })
})
