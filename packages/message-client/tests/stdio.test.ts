import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import type { Link } from '@ts-pf/client'
import { createClient, isLocalFailure } from '@ts-pf/client'
import { procedure, router } from '@ts-pf/contract'
import { decodeFrame, type MessageFrame } from '@ts-pf/message'
import { StdioHandler } from '@ts-pf/message-server/stdio'
import { createImplementer } from '@ts-pf/server'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { StdioLink } from '../src/stdio.js'

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../src')

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function waitFor(
  frames: () => MessageFrame[],
  pred: (frame: MessageFrame) => boolean,
): Promise<MessageFrame> {
  for (let i = 0; i < 80; i++) {
    const found = frames().find(pred)
    if (found) {
      return found
    }
    await nextTurn()
  }
  throw new Error(`timed out waiting for frame: ${JSON.stringify(frames())}`)
}

function collectFrames(stream: PassThrough): () => MessageFrame[] {
  let raw = ''
  stream.on('data', (chunk: Buffer | string) => {
    raw += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
  })
  return () => {
    const frames: MessageFrame[] = []
    for (const line of raw.split('\n')) {
      const stripped = line.trim()
      if (stripped.length === 0) {
        continue
      }
      const decoded = decodeFrame(stripped)
      if (decoded.ok) {
        frames.push(decoded.frame)
      }
    }
    return frames
  }
}

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
    echo: procedure
      .input(z.object({ text: z.string() }))
      .output(z.object({ text: z.string() })),
  },
})

const impl = createImplementer(contract)

const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input }) => ({
      id: input.id,
      name: 'Earth',
    })),
    echo: impl.planet.echo.handler(async ({ input }) => input),
  },
})

function paired() {
  const toHandler = new PassThrough()
  const toLink = new PassThrough()
  return { toHandler, toLink }
}

describe('StdioLink', () => {
  it('is not exported from the package root and index does not import stdio', async () => {
    const exported = await import('../src/index.js')
    expect(exported).not.toHaveProperty('StdioLink')
    expect(Object.keys(exported).sort()).toEqual(['PortLink', 'WsLink'])
    const index = await readFile(join(srcDir, 'index.ts'), 'utf8')
    expect(index).not.toMatch(/stdio/)
    const shared = await readFile(join(srcDir, 'shared.ts'), 'utf8')
    expect(shared).not.toMatch(/node:/)
  })

  it('implements Link without widening it with close', () => {
    expectTypeOf<StdioLink>().toMatchTypeOf<Link>()
    expectTypeOf<Link>().not.toHaveProperty('close')
    expectTypeOf<StdioLink['close']>().toBeFunction()
  })

  it('roundtrips a unary call when the handler is bound first', async () => {
    const { toHandler, toLink } = paired()
    const bind = new StdioHandler(app).bind(
      { input: toHandler, output: toLink },
      { context: {} },
    )
    const link = new StdioLink({ input: toLink, output: toHandler })
    const client = createClient<typeof contract>(link)

    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })

    link.close()
    bind.close()
  })

  it('roundtrips a JSON string that contains a newline as one frame', async () => {
    const { toHandler, toLink } = paired()
    const outbound = collectFrames(toHandler)
    const bind = new StdioHandler(app).bind(
      { input: toHandler, output: toLink },
      { context: {} },
    )
    const link = new StdioLink({ input: toLink, output: toHandler })
    const client = createClient<typeof contract>(link)

    expect(await client.planet.echo({ text: 'hello\nworld' })).toEqual({
      text: 'hello\nworld',
    })
    const call = outbound().find((frame) => frame.type === 'call')
    expect(call).toMatchObject({
      type: 'call',
      path: ['planet', 'echo'],
      input: { text: 'hello\nworld' },
    })
    expect(outbound().filter((frame) => frame.type === 'call')).toHaveLength(1)

    link.close()
    bind.close()
  })

  it('rejects inflight calls with Connection closed on input EOF', async () => {
    const toHandler = new PassThrough()
    const toLink = new PassThrough()
    const frames = collectFrames(toHandler)
    const link = new StdioLink({
      input: toLink,
      output: toHandler,
      helloTimeoutMs: 0,
    })
    toLink.write('{"type":"hello-ok","v":1}\n')

    const pending = link.call(['planet', 'find'], { id: 1 })
    await waitFor(frames, (frame) => frame.type === 'call')
    toLink.end()

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

  it('parses a trailing partial line on EOF when non-empty after strip', async () => {
    const toHandler = new PassThrough()
    const toLink = new PassThrough()
    const frames = collectFrames(toHandler)
    const link = new StdioLink({
      input: toLink,
      output: toHandler,
      helloTimeoutMs: 0,
    })
    toLink.write('{"type":"hello-ok","v":1}\n')

    const pending = link.call(['planet', 'find'], { id: 1 })
    await waitFor(frames, (frame) => frame.type === 'call' && frame.id === '1')
    toLink.write(
      '{"type":"result","id":"1","ok":true,"output":{"id":1,"name":"Earth"}}',
    )
    toLink.end()

    expect(await pending).toEqual({ id: 1, name: 'Earth' })
    link.close()
  })

  it('ignores empty lines between frames', async () => {
    const toHandler = new PassThrough()
    const toLink = new PassThrough()
    const frames = collectFrames(toHandler)
    const link = new StdioLink({
      input: toLink,
      output: toHandler,
      helloTimeoutMs: 0,
    })
    toLink.write('\n\n{"type":"hello-ok","v":1}\n\n')

    const pending = link.call(['planet', 'find'], { id: 1 })
    await waitFor(frames, (frame) => frame.type === 'call')
    toLink.write(
      '\n\n{"type":"result","id":"1","ok":true,"output":{"id":1,"name":"Earth"}}\n\n',
    )
    expect(await pending).toEqual({ id: 1, name: 'Earth' })
    link.close()
  })

  it('accepts CRLF line endings', async () => {
    const toHandler = new PassThrough()
    const toLink = new PassThrough()
    const frames = collectFrames(toHandler)
    const link = new StdioLink({
      input: toLink,
      output: toHandler,
      helloTimeoutMs: 0,
    })
    toLink.write('{"type":"hello-ok","v":1}\r\n')

    const pending = link.call(['planet', 'find'], { id: 1 })
    await waitFor(frames, (frame) => frame.type === 'call')
    toLink.write(
      '{"type":"result","id":"1","ok":true,"output":{"id":1,"name":"Earth"}}\r\n',
    )
    expect(await pending).toEqual({ id: 1, name: 'Earth' })
    link.close()
  })
})
