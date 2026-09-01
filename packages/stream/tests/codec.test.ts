import { JSONCodec, type RpcBodySource } from '@ts-pf/protocol'
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

async function readStream(body: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(body).text()
}

describe('StreamCodec', () => {
  const codec = new StreamCodec()
  const json = new JSONCodec()

  it('encodes JSON-only input as application/json', async () => {
    const encoded = await codec.encodeRequest({ input: { id: 1 } })
    expect(encoded.contentType).toBe('application/json')
    expect(encoded.body).toBe(json.encodeRequest({ input: { id: 1 } }).body)
  })

  it('roundtrips an output async iterable as JSONL', async () => {
    async function* tokens() {
      yield { token: 'Hel' }
      yield { token: 'lo' }
    }
    const encoded = await codec.encodeSuccess(tokens())
    expect(encoded.contentType).toBe('application/jsonl')
    expect(encoded.body).toBeInstanceOf(ReadableStream)
    const text = await readStream(encoded.body as ReadableStream<Uint8Array>)
    expect(text).toBe(
      `${JSON.stringify({ ok: true, output: { token: 'Hel' } })}\n${JSON.stringify({ ok: true, output: { token: 'lo' } })}\n`,
    )
    const decoded = await codec.decodeResponse(jsonlSource(text))
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
    const text = await readStream(encoded.body as ReadableStream<Uint8Array>)
    const decoded = await codec.decodeRequest(jsonlSource(text))
    expect(
      await collect(decoded.input as AsyncIterable<{ chunk: number }>),
    ).toEqual([{ chunk: 1 }, { chunk: 2 }])
  })

  it('writes an in-band failure when the iterator throws', async () => {
    async function* boom() {
      yield { token: 'Hel' }
      throw Object.assign(new Error('gone'), { code: 'skip' })
    }
    const encoded = await codec.encodeSuccess(boom())
    const text = await readStream(encoded.body as ReadableStream<Uint8Array>)
    expect(text).toContain('"token":"Hel"')
    expect(text).toContain('"code":"INTERNAL"')
    const decoded = await codec.decodeResponse(jsonlSource(text))
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

  it('rejects nested streams', async () => {
    async function* inner() {
      yield 1
    }
    await expect(
      codec.encodeRequest({ input: { nested: inner() } }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 })
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
})
