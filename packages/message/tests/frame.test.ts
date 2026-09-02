import { describe, expect, it } from 'vitest'
import { decodeFrame, encodeFrame, type MessageFrame } from '../src/frame.js'

function roundtrip(frame: MessageFrame): string {
  const encoded = encodeFrame(frame)
  expect(decodeFrame(encoded)).toEqual({ ok: true, frame })
  return encoded
}

describe('encodeFrame / decodeFrame', () => {
  describe('roundtrip', () => {
    it('hello', () => {
      roundtrip({ type: 'hello', v: 1 })
    })

    it('hello-ok', () => {
      roundtrip({ type: 'hello-ok', v: 1 })
    })

    it('hello-error', () => {
      roundtrip({
        type: 'hello-error',
        error: { code: 'BAD_REQUEST', message: 'nope' },
      })
      roundtrip({
        type: 'hello-error',
        error: { code: 'INTERNAL', message: '', data: { retry: false } },
      })
    })

    it('call', () => {
      roundtrip({
        type: 'call',
        id: '1',
        path: ['planet', 'find'],
        input: { id: 1 },
      })
      roundtrip({ type: 'call', id: '1', path: ['planet', 'list'] })
      roundtrip({ type: 'call', id: '1', path: [], stream: true })
      roundtrip({ type: 'call', id: '1', path: [] })
    })

    it('result ok', () => {
      roundtrip({
        type: 'result',
        id: '1',
        ok: true,
        output: { id: 1, name: 'Earth' },
      })
    })

    it('result error', () => {
      roundtrip({
        type: 'result',
        id: '1',
        ok: false,
        error: { code: 'NOT_FOUND', message: 'missing', data: { id: 1 } },
      })
      roundtrip({
        type: 'result',
        id: '1',
        ok: false,
        error: { code: 'INTERNAL', message: 'Internal server error' },
      })
    })

    it('cancel', () => {
      roundtrip({ type: 'cancel', id: '1' })
    })

    it('item', () => {
      roundtrip({ type: 'item', id: '1', output: { token: 'Hel' } })
      roundtrip({ type: 'item', id: '1' })
    })

    it('done', () => {
      roundtrip({ type: 'done', id: '1' })
    })

    it('in-item', () => {
      roundtrip({ type: 'in-item', id: '1', input: { chunk: 1 } })
      roundtrip({ type: 'in-item', id: '1' })
    })

    it('in-done', () => {
      roundtrip({ type: 'in-done', id: '1' })
    })
  })

  it('omits output when undefined on void success', () => {
    const encoded = encodeFrame({ type: 'result', id: '1', ok: true })
    expect(encoded).toBe('{"type":"result","id":"1","ok":true}')
    expect(encoded.includes('output')).toBe(false)
    expect(decodeFrame(encoded)).toEqual({
      ok: true,
      frame: { type: 'result', id: '1', ok: true },
    })
  })

  it('omits input, data, meta, and stream when undefined', () => {
    expect(encodeFrame({ type: 'hello', v: 1 })).toBe('{"type":"hello","v":1}')
    expect(
      encodeFrame({
        type: 'hello-error',
        error: { code: 'BAD_REQUEST', message: 'x' },
      }),
    ).toBe(
      '{"type":"hello-error","error":{"code":"BAD_REQUEST","message":"x"}}',
    )
    expect(encodeFrame({ type: 'call', id: '1', path: ['a'] })).toBe(
      '{"type":"call","id":"1","path":["a"]}',
    )
    expect(
      encodeFrame({ type: 'call', id: '1', path: ['a'], stream: true }),
    ).toBe('{"type":"call","id":"1","path":["a"],"stream":true}')
  })

  it('rejects extra keys on a known type', () => {
    expect(decodeFrame('{"type":"hello","v":1,"nope":true}')).toEqual({
      ok: false,
      message: 'Unexpected key nope',
    })
    expect(
      decodeFrame('{"type":"call","id":"1","path":[],"extra":1}'),
    ).toMatchObject({ ok: false, id: '1' })
    expect(
      decodeFrame(
        '{"type":"hello-error","error":{"code":"BAD_REQUEST","message":"x","status":400}}',
      ),
    ).toMatchObject({ ok: false })
  })

  it('rejects v: "1" and non-integer 1', () => {
    expect(decodeFrame('{"type":"hello","v":"1"}').ok).toBe(false)
    expect(decodeFrame('{"type":"hello","v":1.5}').ok).toBe(false)
    expect(decodeFrame('{"type":"hello","v":2}').ok).toBe(false)
    expect(decodeFrame('{"type":"hello"}').ok).toBe(false)
    expect(decodeFrame('{"type":"hello-ok","v":"1"}').ok).toBe(false)
  })

  it('rejects numeric id', () => {
    const decoded = decodeFrame(
      '{"type":"call","id":1,"path":["planet","find"]}',
    )
    expect(decoded.ok).toBe(false)
    if (decoded.ok) {
      throw new Error('expected failure')
    }
    expect(decoded.id).toBeUndefined()
  })

  it('rejects empty id', () => {
    const decoded = decodeFrame('{"type":"cancel","id":""}')
    expect(decoded.ok).toBe(false)
    if (decoded.ok) {
      throw new Error('expected failure')
    }
    expect(decoded.id).toBeUndefined()
  })

  it('requires path to be string[]', () => {
    expect(
      decodeFrame('{"type":"call","id":"1","path":"planet/find"}'),
    ).toMatchObject({ ok: false, id: '1' })
    expect(
      decodeFrame('{"type":"call","id":"1","path":["planet",1]}'),
    ).toMatchObject({ ok: false, id: '1' })
    expect(decodeFrame('{"type":"call","id":"1"}')).toMatchObject({
      ok: false,
      id: '1',
    })
    expect(decodeFrame('{"type":"call","id":"1","path":[]}')).toEqual({
      ok: true,
      frame: { type: 'call', id: '1', path: [] },
    })
  })

  it('rejects stream: false and non-true stream values', () => {
    expect(
      decodeFrame('{"type":"call","id":"1","path":[],"stream":false}'),
    ).toMatchObject({ ok: false, id: '1' })
    expect(
      decodeFrame('{"type":"call","id":"1","path":[],"stream":1}'),
    ).toMatchObject({ ok: false, id: '1' })
    expect(
      decodeFrame('{"type":"call","id":"1","path":[],"stream":"true"}'),
    ).toMatchObject({ ok: false, id: '1' })
  })

  it('rejects stream: true with input present, including null', () => {
    expect(
      decodeFrame(
        '{"type":"call","id":"1","path":[],"stream":true,"input":{}}',
      ),
    ).toMatchObject({ ok: false, id: '1' })
    expect(
      decodeFrame(
        '{"type":"call","id":"1","path":[],"stream":true,"input":null}',
      ),
    ).toMatchObject({ ok: false, id: '1' })
  })

  it('treats call input null as omitted', () => {
    expect(
      decodeFrame('{"type":"call","id":"1","path":["a"],"input":null}'),
    ).toEqual({
      ok: true,
      frame: { type: 'call', id: '1', path: ['a'] },
    })
  })

  it('encodes compact JSON with no raw newline', () => {
    const encoded = encodeFrame({
      type: 'hello',
      v: 1,
      meta: { note: 'line1\nline2', nested: { a: 1 } },
    })
    expect(encoded.includes('\n')).toBe(false)
    expect(encoded).toBe(
      '{"type":"hello","v":1,"meta":{"note":"line1\\nline2","nested":{"a":1}}}',
    )
    expect(encoded).not.toBe(JSON.stringify(JSON.parse(encoded), null, 2))
  })

  it('accepts any JSON hello.meta', () => {
    for (const meta of [
      null,
      1,
      0,
      true,
      false,
      '',
      'token',
      [],
      { token: 'x', nested: [1, { ok: true }] },
    ]) {
      roundtrip({ type: 'hello', v: 1, meta })
    }
  })

  it('never throws on decode: invalid JSON and non-objects', () => {
    expect(decodeFrame('{')).toEqual({
      ok: false,
      message: 'Invalid JSON',
    })
    expect(decodeFrame('[]')).toEqual({
      ok: false,
      message: 'Frame must be a JSON object',
    })
    expect(decodeFrame('null')).toEqual({
      ok: false,
      message: 'Frame must be a JSON object',
    })
    expect(decodeFrame('1')).toEqual({
      ok: false,
      message: 'Frame must be a JSON object',
    })
    expect(decodeFrame('"hello"')).toEqual({
      ok: false,
      message: 'Frame must be a JSON object',
    })
  })

  it('includes id on fail only when it is already a non-empty string', () => {
    const withId = decodeFrame('{"type":"nope","id":"abc"}')
    expect(withId).toEqual({
      ok: false,
      id: 'abc',
      message: 'Unknown or missing type',
    })
    const missingType = decodeFrame('{"id":"abc"}')
    expect(missingType).toEqual({
      ok: false,
      id: 'abc',
      message: 'Unknown or missing type',
    })
    const numeric = decodeFrame('{"type":"nope","id":1}')
    expect(numeric.ok).toBe(false)
    if (numeric.ok) {
      throw new Error('expected failure')
    }
    expect(numeric.id).toBeUndefined()
    expect(decodeFrame('{"type":"toString"}')).toEqual({
      ok: false,
      message: 'Unknown or missing type',
    })
    expect(decodeFrame('{"type":"constructor"}').ok).toBe(false)
  })

  it('rejects illegal result combinations', () => {
    expect(
      decodeFrame(
        '{"type":"result","id":"1","ok":true,"error":{"code":"X","message":""}}',
      ),
    ).toMatchObject({ ok: false, id: '1' })
    expect(
      decodeFrame(
        '{"type":"result","id":"1","ok":false,"error":{"code":"X","message":""},"output":1}',
      ),
    ).toMatchObject({ ok: false, id: '1' })
    expect(decodeFrame('{"type":"result","id":"1","ok":false}')).toMatchObject({
      ok: false,
      id: '1',
    })
    expect(decodeFrame('{"type":"result","id":"1"}')).toMatchObject({
      ok: false,
      id: '1',
    })
    expect(decodeFrame('{"type":"result","id":"1","ok":1}')).toMatchObject({
      ok: false,
      id: '1',
    })
  })

  it('rejects invalid WireError shapes', () => {
    expect(
      decodeFrame('{"type":"hello-error","error":{"code":"","message":"x"}}'),
    ).toMatchObject({ ok: false })
    expect(
      decodeFrame('{"type":"hello-error","error":{"code":1,"message":"x"}}'),
    ).toMatchObject({ ok: false })
    expect(
      decodeFrame(
        '{"type":"hello-error","error":{"code":"BAD_REQUEST","message":1}}',
      ),
    ).toMatchObject({ ok: false })
    expect(decodeFrame('{"type":"hello-error"}')).toMatchObject({ ok: false })
  })

  it('throws TypeError on BigInt and cyclic values', () => {
    expect(() => encodeFrame({ type: 'hello', v: 1, meta: { n: 1n } })).toThrow(
      TypeError,
    )
    const cycle: { self?: unknown } = {}
    cycle.self = cycle
    expect(() => encodeFrame({ type: 'hello', v: 1, meta: cycle })).toThrow(
      TypeError,
    )
  })
})
