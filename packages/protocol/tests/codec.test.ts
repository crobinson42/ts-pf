import { describe, expect, it } from 'vitest'
import { JSONCodec, PFError } from '@ts-pf/protocol'

describe('JSONCodec', () => {
  const codec = new JSONCodec()

  it('roundtrips success and failure envelopes', () => {
    const success = codec.encodeSuccess({ id: 1 })
    expect(JSON.parse(success)).toEqual({ ok: true, output: { id: 1 } })
    expect(codec.decodeResponse(success)).toEqual({ ok: true, output: { id: 1 } })

    const failure = codec.encodeFailure({
      code: 'NOT_FOUND',
      message: 'missing',
      data: { id: 1 },
    })
    expect(codec.decodeResponse(failure)).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'missing', data: { id: 1 } },
    })
  })

  it('decodeRequest accepts missing input as undefined', () => {
    expect(codec.decodeRequest('{}')).toEqual({ input: undefined })
    expect(codec.decodeRequest('{"input":null}')).toEqual({ input: undefined })
    expect(codec.decodeRequest('{"input":{"id":1}}')).toEqual({ input: { id: 1 } })
  })

  it('decodeRequest throws PFError BAD_REQUEST on invalid JSON', () => {
    expect(() => codec.decodeRequest('{')).toThrow(PFError)
    try {
      codec.decodeRequest('{')
    } catch (error) {
      expect(error).toMatchObject({ code: 'BAD_REQUEST', status: 400 })
    }
  })

  it('encodeRequest writes input', () => {
    expect(JSON.parse(codec.encodeRequest({ input: { id: 1 } }))).toEqual({
      input: { id: 1 },
    })
    expect(JSON.parse(codec.encodeRequest({}))).toEqual({})
  })
})
