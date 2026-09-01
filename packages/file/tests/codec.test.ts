import { MultipartCodec } from '@ts-pf/file'
import { JSONCodec, type RpcBodySource } from '@ts-pf/protocol'
import { describe, expect, it } from 'vitest'

function jsonSource(body: string): RpcBodySource {
  return {
    contentType: 'application/json',
    text: async () => body,
    formData: async () => new FormData(),
    body: () => null,
  }
}

function multipartSource(form: FormData): RpcBodySource {
  return {
    contentType: 'multipart/form-data',
    text: async () => {
      throw new Error('expected formData()')
    },
    formData: async () => form,
    body: () => null,
  }
}

describe('MultipartCodec', () => {
  const codec = new MultipartCodec()
  const json = new JSONCodec()

  it('encodes JSON-only input as application/json', async () => {
    const encoded = await codec.encodeRequest({ input: { id: 1 } })
    expect(encoded.contentType).toBe('application/json')
    expect(encoded.body).toBe(json.encodeRequest({ input: { id: 1 } }).body)
  })

  it('roundtrips a nested File as multipart', async () => {
    const photo = new File(['hello'], 'earth.png', { type: 'image/png' })
    const encoded = await codec.encodeRequest({
      input: { name: 'Earth', photo },
    })
    expect(encoded.body).toBeInstanceOf(FormData)
    const form = encoded.body as FormData
    const rpc = form.get('rpc')
    expect(rpc).toBeInstanceOf(Blob)
    const envelope = JSON.parse(await (rpc as Blob).text()) as {
      input: { name: string; photo: { $pf: string; id: string } }
    }
    expect(envelope.input.name).toBe('Earth')
    expect(envelope.input.photo).toEqual({ $pf: 'file', id: '0' })

    const decoded = await codec.decodeRequest(multipartSource(form))
    const input = decoded.input as { name: string; photo: File }
    expect(input.name).toBe('Earth')
    expect(input.photo).toBeInstanceOf(File)
    expect(input.photo.name).toBe('earth.png')
    expect(input.photo.type).toBe('image/png')
    expect(await input.photo.text()).toBe('hello')
  })

  it('roundtrips a root File', async () => {
    const file = new File(['pdf'], 'report.pdf', { type: 'application/pdf' })
    const encoded = await codec.encodeSuccess(file)
    const decoded = await codec.decodeResponse(
      multipartSource(encoded.body as FormData),
    )
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) {
      throw new Error('expected success')
    }
    const output = decoded.output as File
    expect(output).toBeInstanceOf(File)
    expect(output.name).toBe('report.pdf')
    expect(await output.text()).toBe('pdf')
  })

  it('strips path segments from filenames', async () => {
    const photo = new File(['x'], 'a/b/c.png', { type: 'image/png' })
    const encoded = await codec.encodeRequest({ input: { photo } })
    const decoded = await codec.decodeRequest(
      multipartSource(encoded.body as FormData),
    )
    expect((decoded.input as { photo: File }).photo.name).toBe('c.png')
  })

  it('rejects a JSON body that still contains file placeholders', async () => {
    await expect(
      codec.decodeRequest(
        jsonSource(
          JSON.stringify({ input: { photo: { $pf: 'file', id: '0' } } }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 })
  })

  it('rejects missing file parts', async () => {
    const form = new FormData()
    form.set(
      'rpc',
      new Blob(
        [JSON.stringify({ input: { photo: { $pf: 'file', id: '0' } } })],
        { type: 'application/json' },
      ),
    )
    await expect(
      codec.decodeRequest(multipartSource(form)),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 })
  })

  it('rejects extra file parts', async () => {
    const form = new FormData()
    form.set(
      'rpc',
      new Blob([JSON.stringify({ input: { id: 1 } })], {
        type: 'application/json',
      }),
    )
    form.set('0', new File(['x'], 'extra.bin'))
    await expect(
      codec.decodeRequest(multipartSource(form)),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 })
  })

  it('rejects over maxFiles', async () => {
    const limited = new MultipartCodec({ maxFiles: 1 })
    await expect(
      limited.encodeRequest({
        input: {
          a: new File(['a'], 'a.txt'),
          b: new File(['b'], 'b.txt'),
        },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 })
  })

  it('rejects over maxFileSize', async () => {
    const limited = new MultipartCodec({ maxFileSize: 4 })
    await expect(
      limited.encodeRequest({
        input: { photo: new File(['hello'], 'a.txt') },
      }),
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
})
