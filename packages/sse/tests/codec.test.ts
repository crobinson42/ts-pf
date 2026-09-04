import { JSONCodec, type RpcBodySource } from '@ts-pf/http'
import { SSE_CONTENT_TYPE, SseCodec } from '@ts-pf/sse'
import { StreamCodec } from '@ts-pf/stream'
import { describe, expect, it } from 'vitest'

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const item of items) {
    out.push(item)
  }
  return out
}

function jsonSource(body: string): RpcBodySource {
  return {
    contentType: 'application/json',
    text: async () => body,
    formData: async () => new FormData(),
    body: () => null,
  }
}

function jsonlSource(body: string): RpcBodySource {
  return {
    contentType: 'application/jsonl',
    text: async () => body,
    formData: async () => new FormData(),
    body: () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body))
          controller.close()
        },
      }),
  }
}

function sseSource(body: string): RpcBodySource {
  return {
    contentType: SSE_CONTENT_TYPE,
    text: async () => body,
    formData: async () => new FormData(),
    body: () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body))
          controller.close()
        },
      }),
  }
}

async function readStream(body: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(body).text()
}

describe('SseCodec', () => {
  const codec = new SseCodec({ keepAliveMs: 0 })
  const json = new JSONCodec()

  it('encodes JSON-only input as application/json', async () => {
    const encoded = await codec.encodeRequest({ input: { id: 1 } })
    expect(encoded.contentType).toBe('application/json')
    expect(encoded.body).toBe(json.encodeRequest({ input: { id: 1 } }).body)
  })

  it('emits keepalive comments while waiting for the next item', async () => {
    const pinging = new SseCodec({ keepAliveMs: 25 })
    async function* tokens() {
      await new Promise((resolve) => setTimeout(resolve, 80))
      yield { token: 'a' }
    }
    const encoded = await pinging.encodeSuccess(tokens())
    const text = await readStream(encoded.body as ReadableStream<Uint8Array>)
    expect((text.match(/:\n\n/g) ?? []).length).toBeGreaterThan(1)
    expect(text).toContain('event: message')
    expect(text).toContain('event: close')
  })

  it('roundtrips an output async iterable as SSE', async () => {
    async function* tokens() {
      yield { token: 'Hel' }
      yield { token: 'lo' }
    }
    const encoded = await codec.encodeSuccess(tokens())
    expect(encoded.contentType).toBe(SSE_CONTENT_TYPE)
    expect(encoded.body).toBeInstanceOf(ReadableStream)
    const text = await readStream(encoded.body as ReadableStream<Uint8Array>)
    expect(text.startsWith(':\n\n')).toBe(true)
    expect(text).toContain(
      `event: message\ndata: ${JSON.stringify({ ok: true, output: { token: 'Hel' } })}`,
    )
    expect(text).toContain(
      `event: message\ndata: ${JSON.stringify({ ok: true, output: { token: 'lo' } })}`,
    )
    expect(text.endsWith('event: close\n\n')).toBe(true)
    const decoded = await codec.decodeResponse(sseSource(text))
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) {
      throw new Error('expected success')
    }
    expect(
      await collect(decoded.output as AsyncIterable<{ token: string }>),
    ).toEqual([{ token: 'Hel' }, { token: 'lo' }])
  })

  it('roundtrips an input async iterable as JSONL', async () => {
    async function* chunks() {
      yield { chunk: 1 }
      yield { chunk: 2 }
    }
    const encoded = await codec.encodeRequest({ input: chunks() })
    expect(encoded.contentType).toBe('application/jsonl')
    const text = await readStream(encoded.body as ReadableStream<Uint8Array>)
    const decoded = await codec.decodeRequest(jsonlSource(text))
    expect(
      await collect(decoded.input as AsyncIterable<{ chunk: number }>),
    ).toEqual([{ chunk: 1 }, { chunk: 2 }])
  })

  it('writes an in-band error event when the iterator throws', async () => {
    async function* boom() {
      yield { token: 'Hel' }
      throw Object.assign(new Error('gone'), { code: 'skip' })
    }
    const encoded = await codec.encodeSuccess(boom())
    const text = await readStream(encoded.body as ReadableStream<Uint8Array>)
    expect(text).toContain('"token":"Hel"')
    expect(text).toContain('event: error')
    expect(text).toContain('"code":"INTERNAL"')
    expect(text).not.toContain('event: close')
    const decoded = await codec.decodeResponse(sseSource(text))
    if (!decoded.ok) {
      throw new Error('expected stream handle')
    }
    const iter = (decoded.output as AsyncIterable<unknown>)[
      Symbol.asyncIterator
    ]()
    expect(await iter.next()).toEqual({
      done: false,
      value: { token: 'Hel' },
    })
    await expect(iter.next()).rejects.toMatchObject({ code: 'INTERNAL' })
  })

  it('throws INTERNAL when the stream ends without close', async () => {
    const decoded = await codec.decodeResponse(
      sseSource('event: message\ndata: {"ok":true,"output":{"token":"a"}}\n\n'),
    )
    if (!decoded.ok) {
      throw new Error('expected stream handle')
    }
    await expect(
      collect(decoded.output as AsyncIterable<unknown>),
    ).rejects.toMatchObject({ code: 'INTERNAL', message: 'Stream truncated' })
  })

  it('rejects SSE as a request content type', async () => {
    await expect(
      codec.decodeRequest(sseSource('event: message\ndata: {}\n\n')),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 })
  })

  it('rejects nested streams', async () => {
    async function* inner() {
      yield 1
    }
    async function* nested() {
      yield inner()
    }
    const encoded = await codec.encodeSuccess(nested())
    const text = await readStream(encoded.body as ReadableStream<Uint8Array>)
    expect(text).toContain('event: error')
    expect(text).toContain('Nested streams are not supported')
  })

  it('rejects Blob items', async () => {
    async function* files() {
      yield new Blob(['x'])
    }
    const encoded = await codec.encodeSuccess(files())
    const text = await readStream(encoded.body as ReadableStream<Uint8Array>)
    expect(text).toContain('File values are not supported in streams')
  })

  it('encodes failures as JSON', async () => {
    const encoded = await codec.encodeFailure({
      code: 'NOT_FOUND',
      message: 'missing',
    })
    expect(encoded.contentType).toBe('application/json')
    expect(JSON.parse(encoded.body as string)).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'missing' },
    })
  })

  it('decodes a JSON-only request', async () => {
    expect(await codec.decodeRequest(jsonSource('{"input":{"id":1}}'))).toEqual(
      {
        input: { id: 1 },
      },
    )
  })

  it('decodes JSONL responses from a StreamCodec server', async () => {
    const stream = new StreamCodec()
    async function* tokens() {
      yield { token: 'a' }
    }
    const encoded = await stream.encodeSuccess(tokens())
    const text = await readStream(encoded.body as ReadableStream<Uint8Array>)
    const decoded = await codec.decodeResponse(jsonlSource(text))
    if (!decoded.ok) {
      throw new Error('expected success')
    }
    expect(
      await collect(decoded.output as AsyncIterable<{ token: string }>),
    ).toEqual([{ token: 'a' }])
  })
})
