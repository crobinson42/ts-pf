import { describe, expect, it } from 'vitest'
import { encodeSse, readSseEvents } from '../src/sse.js'

function streamOf(body: string | Uint8Array): ReadableStream<Uint8Array> {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

async function collect(
  items: AsyncIterable<{ event: string; data: string }>,
): Promise<{ event: string; data: string }[]> {
  const out: { event: string; data: string }[] = []
  for await (const item of items) {
    out.push(item)
  }
  return out
}

async function readStream(body: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(body).text()
}

describe('readSseEvents', () => {
  it('parses message events', async () => {
    expect(
      await collect(
        readSseEvents(
          streamOf(
            'event: message\ndata: {"ok":true,"output":1}\n\nevent: close\n\n',
          ),
        ),
      ),
    ).toEqual([
      { event: 'message', data: '{"ok":true,"output":1}' },
      { event: 'close', data: '' },
    ])
  })

  it('strips a leading BOM', async () => {
    expect(
      await collect(
        readSseEvents(
          streamOf(
            `\uFEFFevent: message\ndata: {"ok":true}\n\nevent: close\n\n`,
          ),
        ),
      ),
    ).toEqual([
      { event: 'message', data: '{"ok":true}' },
      { event: 'close', data: '' },
    ])
  })

  it('strips one space after the colon', async () => {
    expect(
      await collect(
        readSseEvents(
          streamOf('event: message\ndata:test\n\nevent: close\n\n'),
        ),
      ),
    ).toEqual([
      { event: 'message', data: 'test' },
      { event: 'close', data: '' },
    ])
  })

  it('ignores comments', async () => {
    expect(
      await collect(
        readSseEvents(
          streamOf(': ping\n\nevent: message\ndata: 1\n\nevent: close\n\n'),
        ),
      ),
    ).toEqual([
      { event: 'message', data: '1' },
      { event: 'close', data: '' },
    ])
  })

  it('drops empty-data events except close', async () => {
    expect(
      await collect(
        readSseEvents(
          streamOf('event: message\n\nevent: ping\n\nevent: close\n\n'),
        ),
      ),
    ).toEqual([{ event: 'close', data: '' }])
  })

  it('accepts CRLF line endings', async () => {
    expect(
      await collect(
        readSseEvents(
          streamOf('event: message\r\ndata: hi\r\n\r\nevent: close\r\n\r\n'),
        ),
      ),
    ).toEqual([
      { event: 'message', data: 'hi' },
      { event: 'close', data: '' },
    ])
  })

  it('joins multi-line data with newlines', async () => {
    expect(
      await collect(
        readSseEvents(
          streamOf('data: YHOO\ndata: +2\ndata: 10\n\nevent: close\n\n'),
        ),
      ),
    ).toEqual([
      { event: 'message', data: 'YHOO\n+2\n10' },
      { event: 'close', data: '' },
    ])
  })

  it('discards an incomplete last event at EOF', async () => {
    expect(
      await collect(
        readSseEvents(streamOf('event: message\ndata: incomplete')),
      ),
    ).toEqual([])
  })
})

describe('encodeSse', () => {
  it('writes an initial comment, messages, and close', async () => {
    async function* items() {
      yield 1
      yield 2
    }
    const body = encodeSse(
      items(),
      (item) => JSON.stringify({ ok: true, output: item }),
      () => '',
      0,
    )
    expect(await readStream(body)).toBe(
      `:\n\nevent: message\ndata: ${JSON.stringify({ ok: true, output: 1 })}\n\nevent: message\ndata: ${JSON.stringify({ ok: true, output: 2 })}\n\nevent: close\n\n`,
    )
  })

  it('writes an error event and does not close', async () => {
    async function* items() {
      yield 1
      throw new Error('boom')
    }
    const body = encodeSse(
      items(),
      (item) => JSON.stringify({ ok: true, output: item }),
      () => JSON.stringify({ ok: false, error: { code: 'INTERNAL' } }),
      0,
    )
    const text = await readStream(body)
    expect(text).toContain('event: message')
    expect(text).toContain('event: error')
    expect(text).not.toContain('event: close')
  })
})
