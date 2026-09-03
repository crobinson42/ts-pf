import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { procedure, router } from '@ts-pf/contract'
import { decodeFrame, type MessageFrame } from '@ts-pf/message'
import { createImplementer, type ImplementedRouter } from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { StdioHandler } from '../src/stdio.js'

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
  stream.setEncoding('utf8')
  stream.on('data', (chunk: string) => {
    raw += chunk
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

function planetApp(
  find: Parameters<typeof impl.planet.find.handler>[0],
): ImplementedRouter {
  return impl.router({
    planet: {
      find: impl.planet.find.handler(find),
      echo: impl.planet.echo.handler(async ({ input }) => input),
    },
  })
}

const defaultApp = planetApp(async ({ input }) => ({
  id: input.id,
  name: 'Earth',
}))

describe('StdioHandler', () => {
  it('is not exported from the package root and index does not import stdio', async () => {
    const exported = await import('../src/index.js')
    expect(exported).not.toHaveProperty('StdioHandler')
    expect(Object.keys(exported).sort()).toEqual(['PortHandler', 'WsHandler'])
    const index = await readFile(join(srcDir, 'index.ts'), 'utf8')
    expect(index).not.toMatch(/stdio/)
    const shared = await readFile(join(srcDir, 'shared.ts'), 'utf8')
    expect(shared).not.toMatch(/node:/)
  })

  it('roundtrips a unary call over compact NDJSON', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const frames = collectFrames(output)
    const bind = new StdioHandler(defaultApp).bind(
      { input, output },
      { context: {} },
    )

    input.write('{"type":"hello","v":1}\n')
    await waitFor(frames, (frame) => frame.type === 'hello-ok')
    expect(frames().filter((frame) => frame.type === 'hello-ok')).toEqual([
      { type: 'hello-ok', v: 1 },
    ])

    input.write(
      '{"type":"call","id":"1","path":["planet","find"],"input":{"id":1}}\n',
    )
    const result = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(result).toEqual({
      type: 'result',
      id: '1',
      ok: true,
      output: { id: 1, name: 'Earth' },
    })

    bind.close()
    bind.close()
  })

  it('keeps a payload newline inside a JSON string as one frame', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const frames = collectFrames(output)
    const bind = new StdioHandler(defaultApp).bind(
      { input, output },
      { context: {} },
    )

    input.write('{"type":"hello","v":1}\n')
    await waitFor(frames, (frame) => frame.type === 'hello-ok')
    input.write(
      '{"type":"call","id":"1","path":["planet","echo"],"input":{"text":"a\\nb"}}\n',
    )
    const result = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(result).toEqual({
      type: 'result',
      id: '1',
      ok: true,
      output: { text: 'a\nb' },
    })
    expect(frames().filter((frame) => frame.type === 'result')).toHaveLength(1)

    bind.close()
  })

  it('ignores empty lines', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const frames = collectFrames(output)
    const bind = new StdioHandler(defaultApp).bind(
      { input, output },
      { context: {} },
    )

    input.write('\n\n  \n{"type":"hello","v":1}\n\n\n')
    await waitFor(frames, (frame) => frame.type === 'hello-ok')
    input.write(
      '\n{"type":"call","id":"1","path":["planet","find"],"input":{"id":1}}\n\n',
    )
    const result = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(result).toMatchObject({ ok: true, id: '1' })

    bind.close()
  })

  it('accepts CRLF line endings', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const frames = collectFrames(output)
    const bind = new StdioHandler(defaultApp).bind(
      { input, output },
      { context: {} },
    )

    input.write('{"type":"hello","v":1}\r\n')
    await waitFor(frames, (frame) => frame.type === 'hello-ok')
    input.write(
      '{"type":"call","id":"1","path":["planet","find"],"input":{"id":1}}\r\n',
    )
    const result = await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(result).toEqual({
      type: 'result',
      id: '1',
      ok: true,
      output: { id: 1, name: 'Earth' },
    })

    bind.close()
  })

  it('parses a trailing partial line on EOF when non-empty after strip', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const frames = collectFrames(output)
    const bind = new StdioHandler(defaultApp).bind(
      { input, output },
      { context: {} },
    )

    input.write('{"type":"hello","v":1}')
    input.end()
    await waitFor(frames, (frame) => frame.type === 'hello-ok')

    bind.close()
  })

  it('aborts in-flight calls when input EOF disconnects', async () => {
    let resolveStarted!: () => void
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    let aborted = false
    const app = planetApp(async ({ signal }) => {
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
        resolveStarted()
      })
      return { id: 1, name: 'late' }
    })
    const input = new PassThrough()
    const output = new PassThrough()
    const frames = collectFrames(output)
    const bind = new StdioHandler(app).bind({ input, output }, { context: {} })

    input.write('{"type":"hello","v":1}\n')
    await waitFor(frames, (frame) => frame.type === 'hello-ok')
    input.write(
      '{"type":"call","id":"1","path":["planet","find"],"input":{"id":1}}\n',
    )
    await started
    input.end()

    for (let i = 0; i < 40; i++) {
      await nextTurn()
    }
    expect(aborted).toBe(true)
    expect(frames().some((frame) => frame.type === 'result')).toBe(false)
    bind.close()
  })

  it('closes and drops the buffer when an unterminated line exceeds maxFrameBytes', async () => {
    let ran = false
    const app = planetApp(async ({ input }) => {
      ran = true
      return { id: input.id, name: 'Earth' }
    })
    const input = new PassThrough()
    const output = new PassThrough()
    const frames = collectFrames(output)
    const bind = new StdioHandler(app, {
      maxFrameBytes: 80,
      helloTimeoutMs: 0,
    }).bind({ input, output }, { context: {} })

    input.write('{"type":"hello","v":1}\n')
    await waitFor(frames, (frame) => frame.type === 'hello-ok')
    input.write(
      `{"type":"call","id":"1","path":["planet","find"],"pad":"${'x'.repeat(200)}"`,
    )

    for (let i = 0; i < 20; i++) {
      await nextTurn()
    }
    expect(ran).toBe(false)
    expect(frames().filter((frame) => frame.type === 'result')).toEqual([])
    input.write('}\n')
    for (let i = 0; i < 20; i++) {
      await nextTurn()
    }
    expect(ran).toBe(false)

    bind.close()
  })

  it('passes streams and meta into the context factory, not into the procedure', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const frames = collectFrames(output)
    const factoryInfo: unknown[] = []
    let procedureContext: unknown
    const app = planetApp(async ({ input: body, context }) => {
      procedureContext = context
      return { id: body.id, name: 'Earth' }
    })
    const bind = new StdioHandler<{ user: string }>(app).bind(
      { input, output },
      {
        context: (info) => {
          factoryInfo.push(info)
          return { user: 'ada' }
        },
      },
    )

    input.write('{"type":"hello","v":1,"meta":{"token":"t"}}\n')
    await waitFor(frames, (frame) => frame.type === 'hello-ok')
    expect(factoryInfo).toEqual([{ input, output, meta: { token: 't' } }])

    input.write(
      '{"type":"call","id":"1","path":["planet","find"],"input":{"id":1}}\n',
    )
    await waitFor(
      frames,
      (frame) => frame.type === 'result' && frame.id === '1',
    )
    expect(procedureContext).toEqual({ user: 'ada' })

    bind.close()
  })
})
