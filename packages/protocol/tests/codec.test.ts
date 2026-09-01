import { JSONCodec, PFError, type RpcBodySource } from '@ts-pf/protocol'
import { describe, expect, it } from 'vitest'

function source(body: string, contentType = 'application/json'): RpcBodySource {
  return {
    contentType,
    text: async () => body,
    formData: async () => new FormData(),
    body: () => bytes(body),
  }
}

function bytes(body: string): ReadableStream<Uint8Array> | null {
  if (body.length === 0) {
    return null
  }
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    },
  })
}

describe('JSONCodec', () => {
  const codec = new JSONCodec()

  it('encodeSuccess returns JSON body and content-type', () => {
    const encoded = codec.encodeSuccess({ id: 1 })
    expect(encoded.contentType).toBe('application/json')
    expect(JSON.parse(encoded.body as string)).toEqual({
      ok: true,
      output: { id: 1 },
    })
  })

  it('roundtrips success and failure envelopes', async () => {
    const success = codec.encodeSuccess({ id: 1 })
    expect(await codec.decodeResponse(source(success.body as string))).toEqual({
      ok: true,
      output: { id: 1 },
    })

    const failure = codec.encodeFailure({
      code: 'NOT_FOUND',
      message: 'missing',
      data: { id: 1 },
    })
    expect(await codec.decodeResponse(source(failure.body as string))).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'missing', data: { id: 1 } },
    })
  })

  it('decodeRequest accepts missing input as undefined', async () => {
    expect(await codec.decodeRequest(source('{}'))).toEqual({
      input: undefined,
    })
    expect(await codec.decodeRequest(source('{"input":null}'))).toEqual({
      input: undefined,
    })
    expect(await codec.decodeRequest(source('{"input":{"id":1}}'))).toEqual({
      input: { id: 1 },
    })
  })

  it('decodeRequest treats empty body as {}', async () => {
    expect(await codec.decodeRequest(source(''))).toEqual({ input: undefined })
  })

  it('decodeRequest throws PFError BAD_REQUEST on invalid JSON', async () => {
    await expect(codec.decodeRequest(source('{'))).rejects.toThrow(PFError)
    await expect(codec.decodeRequest(source('{'))).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      status: 400,
    })
  })

  it('encodeRequest writes input', () => {
    const withInput = codec.encodeRequest({ input: { id: 1 } })
    expect(withInput.contentType).toBe('application/json')
    expect(JSON.parse(withInput.body as string)).toEqual({ input: { id: 1 } })
    expect(JSON.parse(codec.encodeRequest({}).body as string)).toEqual({})
  })
})
