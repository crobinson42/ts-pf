import { createClient, isLocalFailure } from '@ts-pf/client'
import { procedure, router } from '@ts-pf/contract'
import { type Duplex, type MessageFrame, MessageSession } from '@ts-pf/message'
import { PortHandler } from '@ts-pf/message-server'
import { createImplementer } from '@ts-pf/server'
import { stream } from '@ts-pf/stream'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { PortLink } from '../src/index.js'

const contract = router({
  planet: {
    chat: procedure
      .input(z.object({ prompt: z.string() }))
      .output(stream(z.object({ token: z.string() }))),
    empty: procedure.output(stream(z.object({ token: z.string() }))),
    ingest: procedure
      .input(stream(z.object({ chunk: z.number() })))
      .output(z.object({ count: z.number() })),
    echo: procedure
      .input(stream(z.object({ chunk: z.string() })))
      .output(stream(z.object({ token: z.string() }))),
    fail: procedure.output(stream(z.object({ token: z.string() }))).errors({
      NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
    }),
    nested: procedure.output(stream(z.any())),
    file: procedure.output(stream(z.any())),
  },
})

const impl = createImplementer(contract)

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const item of items) {
    out.push(item)
  }
  return out
}

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

async function waitUntil(pred: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (pred()) {
      return
    }
    await nextTurn()
  }
  throw new Error('timed out waiting for condition')
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

function openApp(app: ReturnType<typeof impl.router>) {
  const { port1, port2 } = new MessageChannel()
  const bind = new PortHandler(app).bind(port1, { context: {} })
  const link = new PortLink({ port: port2 })
  const client = createClient<typeof contract>(link)
  return { bind, client, link }
}

function openPeer(port: MessagePort): {
  session: MessageSession
  frames: MessageFrame[]
} {
  const frames: MessageFrame[] = []
  const session = new MessageSession({
    duplex: portDuplex(port),
    role: 'server',
    onFrame: (frame) => {
      frames.push(frame)
    },
  })
  port.start()
  return { session, frames }
}

describe('message stream e2e', () => {
  it('streams output tokens', async () => {
    const app = impl.router({
      planet: {
        chat: impl.planet.chat.handler(async function* ({ input }) {
          yield { token: input.prompt.slice(0, 1) }
          yield { token: input.prompt.slice(1) }
        }),
        empty: impl.planet.empty.handler(async function* () {}),
        ingest: impl.planet.ingest.handler(async () => ({ count: 0 })),
        echo: impl.planet.echo.handler(async function* () {}),
        fail: impl.planet.fail.handler(async function* () {}),
        nested: impl.planet.nested.handler(async function* () {}),
        file: impl.planet.file.handler(async function* () {}),
      },
    })
    const { bind, client, link } = openApp(app)

    const tokens = await client.planet.chat({ prompt: 'Hi' })
    expect(await collect(tokens)).toEqual([{ token: 'H' }, { token: 'i' }])

    link.close()
    bind.close()
  })

  it('resolves an empty stream to done with zero items', async () => {
    const app = impl.router({
      planet: {
        chat: impl.planet.chat.handler(async function* () {}),
        empty: impl.planet.empty.handler(async function* () {}),
        ingest: impl.planet.ingest.handler(async () => ({ count: 0 })),
        echo: impl.planet.echo.handler(async function* () {}),
        fail: impl.planet.fail.handler(async function* () {}),
        nested: impl.planet.nested.handler(async function* () {}),
        file: impl.planet.file.handler(async function* () {}),
      },
    })
    const { bind, client, link } = openApp(app)

    const tokens = await client.planet.empty()
    expect(await collect(tokens)).toEqual([])

    link.close()
    bind.close()
  })

  it('ingests an input stream', async () => {
    const app = impl.router({
      planet: {
        chat: impl.planet.chat.handler(async function* () {}),
        empty: impl.planet.empty.handler(async function* () {}),
        ingest: impl.planet.ingest.handler(async ({ input }) => {
          let count = 0
          for await (const item of input) {
            count += item.chunk
          }
          return { count }
        }),
        echo: impl.planet.echo.handler(async function* () {}),
        fail: impl.planet.fail.handler(async function* () {}),
        nested: impl.planet.nested.handler(async function* () {}),
        file: impl.planet.file.handler(async function* () {}),
      },
    })
    const { bind, client, link } = openApp(app)

    async function* chunks() {
      yield { chunk: 1 }
      yield { chunk: 2 }
    }
    expect(await client.planet.ingest(chunks())).toEqual({ count: 3 })

    link.close()
    bind.close()
  })

  it('interleaves duplex input and output', async () => {
    const app = impl.router({
      planet: {
        chat: impl.planet.chat.handler(async function* () {}),
        empty: impl.planet.empty.handler(async function* () {}),
        ingest: impl.planet.ingest.handler(async () => ({ count: 0 })),
        echo: impl.planet.echo.handler(async function* ({ input }) {
          for await (const item of input) {
            yield { token: item.chunk.toUpperCase() }
          }
        }),
        fail: impl.planet.fail.handler(async function* () {}),
        nested: impl.planet.nested.handler(async function* () {}),
        file: impl.planet.file.handler(async function* () {}),
      },
    })
    const { bind, client, link } = openApp(app)

    const pending: { chunk: string }[] = []
    let notify: (() => void) | undefined
    let ended = false
    const wake = (): void => {
      const fn = notify
      notify = undefined
      fn?.()
    }
    const input: AsyncIterable<{ chunk: string }> = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            while (pending.length === 0 && !ended) {
              await new Promise<void>((resolve) => {
                notify = resolve
              })
            }
            if (pending.length > 0) {
              return {
                done: false,
                value: pending.shift() as { chunk: string },
              }
            }
            return { done: true, value: undefined }
          },
        }
      },
    }

    const received: { token: string }[] = []
    const consume = (async () => {
      const tokens = await client.planet.echo(input)
      for await (const token of tokens) {
        received.push(token)
      }
    })()

    pending.push({ chunk: 'a' })
    wake()
    await waitUntil(() => received.length === 1)
    expect(received).toEqual([{ token: 'A' }])

    pending.push({ chunk: 'b' })
    wake()
    await waitUntil(() => received.length === 2)
    expect(received).toEqual([{ token: 'A' }, { token: 'B' }])

    ended = true
    wake()
    await consume
    expect(received).toEqual([{ token: 'A' }, { token: 'B' }])

    link.close()
    bind.close()
  })

  it('rejects a mid-stream error with no done', async () => {
    const app = impl.router({
      planet: {
        chat: impl.planet.chat.handler(async function* () {}),
        empty: impl.planet.empty.handler(async function* () {}),
        ingest: impl.planet.ingest.handler(async () => ({ count: 0 })),
        echo: impl.planet.echo.handler(async function* () {}),
        fail: impl.planet.fail.handler(async function* ({ errors }) {
          yield { token: 'a' }
          throw errors.NOT_FOUND({ id: 1 })
        }),
        nested: impl.planet.nested.handler(async function* () {}),
        file: impl.planet.file.handler(async function* () {}),
      },
    })
    const { bind, client, link } = openApp(app)

    const tokens = await client.planet.fail()
    const iter = tokens[Symbol.asyncIterator]()
    expect(await iter.next()).toEqual({
      done: false,
      value: { token: 'a' },
    })
    const error = await iter.next().then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isLocalFailure(error)).toBe(false)
    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'NOT_FOUND',
      data: { id: 1 },
    })

    link.close()
    bind.close()
  })

  it('cancels both sides when the output iterator returns', async () => {
    let aborted = false
    const app = impl.router({
      planet: {
        chat: impl.planet.chat.handler(async function* ({ signal }) {
          yield { token: 'a' }
          await new Promise<void>((resolve) => {
            const onAbort = () => {
              aborted = true
              resolve()
            }
            if (signal?.aborted) {
              onAbort()
              return
            }
            signal?.addEventListener('abort', onAbort)
          })
          yield { token: 'late' }
        }),
        empty: impl.planet.empty.handler(async function* () {}),
        ingest: impl.planet.ingest.handler(async () => ({ count: 0 })),
        echo: impl.planet.echo.handler(async function* () {}),
        fail: impl.planet.fail.handler(async function* () {}),
        nested: impl.planet.nested.handler(async function* () {}),
        file: impl.planet.file.handler(async function* () {}),
      },
    })
    const { bind, client, link } = openApp(app)

    const tokens = await client.planet.chat({ prompt: 'Hi' })
    const iter = tokens[Symbol.asyncIterator]()
    expect(await iter.next()).toEqual({
      done: false,
      value: { token: 'a' },
    })
    await iter.return?.()
    await waitUntil(() => aborted)
    expect(aborted).toBe(true)
    expect(await iter.next()).toEqual({ done: true, value: undefined })

    link.close()
    bind.close()
  })

  it('ignores result ok true after an item', async () => {
    const { port1, port2 } = new MessageChannel()
    const peer = openPeer(port1)
    const link = new PortLink({ port: port2 })
    await peer.session.ready

    const pending = link.call(['planet', 'chat'], { prompt: 'Hi' })
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
        type: 'result',
        id: '1',
        ok: true,
        output: { ignored: true },
      }).ok,
    ).toBe(true)
    expect(
      peer.session.send({
        type: 'item',
        id: '1',
        output: { token: 'b' },
      }).ok,
    ).toBe(true)
    expect(peer.session.send({ type: 'done', id: '1' }).ok).toBe(true)
    expect(await collect(tokens as AsyncIterable<{ token: string }>)).toEqual([
      { token: 'a' },
      { token: 'b' },
    ])

    link.close()
    peer.session.close()
  })

  it('ignores in-item after in-done', async () => {
    const seen: number[] = []
    const app = impl.router({
      planet: {
        chat: impl.planet.chat.handler(async function* () {}),
        empty: impl.planet.empty.handler(async function* () {}),
        ingest: impl.planet.ingest.handler(async ({ input }) => {
          for await (const item of input) {
            seen.push(item.chunk)
          }
          return { count: seen.reduce((sum, n) => sum + n, 0) }
        }),
        echo: impl.planet.echo.handler(async function* () {}),
        fail: impl.planet.fail.handler(async function* () {}),
        nested: impl.planet.nested.handler(async function* () {}),
        file: impl.planet.file.handler(async function* () {}),
      },
    })
    const { port1, port2 } = new MessageChannel()
    const bind = new PortHandler(app).bind(port1, { context: {} })
    const frames: MessageFrame[] = []
    const session = new MessageSession({
      duplex: portDuplex(port2),
      role: 'client',
      onFrame: (frame) => {
        frames.push(frame)
      },
    })
    port2.start()
    await session.ready

    expect(
      session.send({
        type: 'call',
        id: '1',
        path: ['planet', 'ingest'],
        stream: true,
      }).ok,
    ).toBe(true)
    expect(
      session.send({
        type: 'in-item',
        id: '1',
        input: { chunk: 1 },
      }).ok,
    ).toBe(true)
    expect(session.send({ type: 'in-done', id: '1' }).ok).toBe(true)
    expect(
      session.send({
        type: 'in-item',
        id: '1',
        input: { chunk: 99 },
      }).ok,
    ).toBe(true)

    const result = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(result).toEqual({
      type: 'result',
      id: '1',
      ok: true,
      output: { count: 1 },
    })
    expect(seen).toEqual([1])

    session.close()
    bind.close()
  })

  it('rejects a nested stream item with BAD_REQUEST', async () => {
    const app = impl.router({
      planet: {
        chat: impl.planet.chat.handler(async function* () {}),
        empty: impl.planet.empty.handler(async function* () {}),
        ingest: impl.planet.ingest.handler(async () => ({ count: 0 })),
        echo: impl.planet.echo.handler(async function* () {}),
        fail: impl.planet.fail.handler(async function* () {}),
        nested: impl.planet.nested.handler(async function* () {
          async function* inner() {
            yield 1
          }
          yield inner()
        }),
        file: impl.planet.file.handler(async function* () {}),
      },
    })
    const { bind, client, link } = openApp(app)

    const error = await client.planet.nested().then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isLocalFailure(error)).toBe(false)
    expect(error).toMatchObject({
      code: 'BAD_REQUEST',
      status: 400,
      message: 'Nested streams are not supported',
    })

    link.close()
    bind.close()
  })

  it('rejects a File item with BAD_REQUEST', async () => {
    const app = impl.router({
      planet: {
        chat: impl.planet.chat.handler(async function* () {}),
        empty: impl.planet.empty.handler(async function* () {}),
        ingest: impl.planet.ingest.handler(async () => ({ count: 0 })),
        echo: impl.planet.echo.handler(async function* () {}),
        fail: impl.planet.fail.handler(async function* () {}),
        nested: impl.planet.nested.handler(async function* () {}),
        file: impl.planet.file.handler(async function* () {
          yield new File(['x'], 'a.txt')
        }),
      },
    })
    const { bind, client, link } = openApp(app)

    const error = await client.planet.file().then(
      () => {
        throw new Error('should reject')
      },
      (reason: unknown) => reason,
    )
    expect(isLocalFailure(error)).toBe(false)
    expect(error).toMatchObject({
      code: 'BAD_REQUEST',
      status: 400,
      message: 'File values are not supported in streams',
    })

    link.close()
    bind.close()
  })
})
