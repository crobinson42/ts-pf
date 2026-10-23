import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  type EnvelopeTextCodec,
  isJsonContentType,
  JSONCodec,
  jsonBodySource,
  mimeType,
  type RpcCodec,
  type RpcEncodedText,
} from '../src/index.js'

describe('mimeType', () => {
  it('drops parameters, whitespace, and case', () => {
    expect(mimeType('application/json; charset=utf-8')).toBe('application/json')
    expect(mimeType(' Multipart/Form-Data ; boundary=x')).toBe(
      'multipart/form-data',
    )
    expect(mimeType('text/event-stream')).toBe('text/event-stream')
  })

  it('is empty for a missing header', () => {
    expect(mimeType(null)).toBe('')
    expect(mimeType(undefined)).toBe('')
    expect(mimeType('')).toBe('')
  })
})

describe('isJsonContentType', () => {
  it('accepts application/json and a missing header', () => {
    expect(isJsonContentType('application/json')).toBe(true)
    expect(isJsonContentType('application/json; charset=utf-8')).toBe(true)
    expect(isJsonContentType(null)).toBe(true)
    expect(isJsonContentType('')).toBe(true)
  })

  it('rejects other media types', () => {
    expect(isJsonContentType('text/plain')).toBe(false)
    expect(isJsonContentType('application/jsonl')).toBe(false)
    expect(isJsonContentType('multipart/form-data; boundary=x')).toBe(false)
  })
})

describe('jsonBodySource', () => {
  it('serves the text as an application/json body with no stream or form', async () => {
    const source = jsonBodySource('{"ok":true,"output":1}')
    expect(source.contentType).toBe('application/json')
    expect(await source.text()).toBe('{"ok":true,"output":1}')
    expect(source.body()).toBeNull()
    expect((await source.formData()).has('rpc')).toBe(false)
  })

  it('round-trips through JSONCodec', async () => {
    const codec = new JSONCodec()
    const encoded = codec.encodeSuccess({ id: 1 })
    const decoded = await codec.decodeResponse(jsonBodySource(encoded.body))
    expect(decoded).toEqual({ ok: true, output: { id: 1 } })
  })
})

describe('EnvelopeTextCodec', () => {
  it('is implemented by JSONCodec and is still an RpcCodec', () => {
    const codec = new JSONCodec()
    expectTypeOf(codec).toMatchTypeOf<EnvelopeTextCodec>()
    expectTypeOf(codec).toMatchTypeOf<RpcCodec>()
    expectTypeOf<EnvelopeTextCodec>().toMatchTypeOf<RpcCodec>()
    expectTypeOf(codec.encodeSuccess(1)).toEqualTypeOf<RpcEncodedText>()
    expectTypeOf(codec.encodeRequest({ input: 1 }).body).toBeString()
  })

  it('rejects a codec whose bodies are not text', () => {
    const blobCodec: RpcCodec = {
      encodeRequest: () => ({
        contentType: 'application/octet-stream',
        body: new Blob(),
      }),
      decodeRequest: () => ({ input: undefined }),
      encodeSuccess: () => ({
        contentType: 'application/octet-stream',
        body: new Blob(),
      }),
      encodeFailure: () => ({
        contentType: 'application/octet-stream',
        body: new Blob(),
      }),
      decodeResponse: () => ({ ok: true, output: undefined as never }),
    }
    // @ts-expect-error an RpcCodec is not an EnvelopeTextCodec
    const inner: EnvelopeTextCodec = blobCodec
    expect(inner).toBe(blobCodec)
  })
})
