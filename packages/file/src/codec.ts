import {
  JSONCodec,
  PFError,
  type RpcBodySource,
  type RpcCodec,
  type RpcEncodedBody,
  type RpcRequest,
  type RpcResponse,
} from '@ts-pf/protocol'
import {
  assertNoPlaceholders,
  extractFiles,
  fileFromPart,
  injectFiles,
} from './files.js'

const DEFAULT_MAX_FILES = 32
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024

function mime(contentType: string | null): string {
  if (contentType == null || contentType === '') {
    return ''
  }
  return contentType.split(';')[0]?.trim().toLowerCase() ?? ''
}

function isJsonContentType(contentType: string | null): boolean {
  const type = mime(contentType)
  return type === '' || type === 'application/json'
}

function isMultipartContentType(contentType: string | null): boolean {
  return mime(contentType) === 'multipart/form-data'
}

function badRequest(message: string): PFError {
  return new PFError({ code: 'BAD_REQUEST', status: 400, message })
}

function jsonSource(text: string): RpcBodySource {
  return {
    contentType: 'application/json',
    text: async () => text,
    formData: async () => new FormData(),
    body: () => null,
  }
}

async function jsonText(encoded: RpcEncodedBody): Promise<string> {
  if (typeof encoded.body === 'string') {
    return encoded.body
  }
  throw new Error('MultipartCodec inner codec must produce a JSON string')
}

export class MultipartCodec implements RpcCodec {
  private readonly inner: RpcCodec
  private readonly maxFiles: number
  private readonly maxFileSize: number

  constructor(options?: {
    inner?: RpcCodec
    maxFiles?: number
    maxFileSize?: number
  }) {
    this.inner = options?.inner ?? new JSONCodec()
    this.maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES
    this.maxFileSize = options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE
  }

  async encodeRequest(req: RpcRequest): Promise<RpcEncodedBody> {
    return this.encodeWithFiles(req.input, (value) =>
      this.inner.encodeRequest({ input: value }),
    )
  }

  async decodeRequest(source: RpcBodySource): Promise<RpcRequest> {
    if (isMultipartContentType(source.contentType)) {
      const { json, parts } = await this.readMultipart(source)
      const decoded = await this.inner.decodeRequest(jsonSource(json))
      return { input: injectFiles(decoded.input, parts) }
    }
    if (!isJsonContentType(source.contentType)) {
      throw badRequest('Unsupported content type')
    }
    const decoded = await this.inner.decodeRequest(source)
    assertNoPlaceholders(decoded.input)
    return decoded
  }

  async encodeSuccess<T>(output: T): Promise<RpcEncodedBody> {
    return this.encodeWithFiles(output, (value) =>
      this.inner.encodeSuccess(value),
    )
  }

  encodeFailure(error: {
    code: string
    message: string
    data?: unknown
  }): RpcEncodedBody | Promise<RpcEncodedBody> {
    return this.inner.encodeFailure(error)
  }

  async decodeResponse<T = unknown>(
    source: RpcBodySource,
  ): Promise<RpcResponse<T>> {
    if (isMultipartContentType(source.contentType)) {
      const { json, parts } = await this.readMultipart(source)
      const decoded = await this.inner.decodeResponse<T>(jsonSource(json))
      if (!decoded.ok) {
        return decoded
      }
      return { ok: true, output: injectFiles(decoded.output, parts) as T }
    }
    if (!isJsonContentType(source.contentType)) {
      throw badRequest('Unsupported content type')
    }
    const decoded = await this.inner.decodeResponse<T>(source)
    if (decoded.ok) {
      assertNoPlaceholders(decoded.output)
    }
    return decoded
  }

  private async encodeWithFiles(
    value: unknown,
    encodeJson: (value: unknown) => RpcEncodedBody | Promise<RpcEncodedBody>,
  ): Promise<RpcEncodedBody> {
    const extracted = extractFiles(value, {
      maxFiles: this.maxFiles,
      maxFileSize: this.maxFileSize,
    })
    const encoded = await encodeJson(extracted.value)
    if (extracted.files.length === 0) {
      return encoded
    }
    const json = await jsonText(encoded)
    const form = new FormData()
    form.set('rpc', new Blob([json], { type: 'application/json' }))
    for (const [index, file] of extracted.files.entries()) {
      const filename = file instanceof File && file.name ? file.name : 'blob'
      form.set(String(index), file, filename)
    }
    return { contentType: 'multipart/form-data', body: form }
  }

  private async readMultipart(
    source: RpcBodySource,
  ): Promise<{ json: string; parts: Map<string, Blob> }> {
    const form = await source.formData()
    const rpc = form.get('rpc')
    if (rpc == null) {
      throw badRequest('Missing rpc part')
    }
    const json = typeof rpc === 'string' ? rpc : await rpc.text()

    const parts = new Map<string, Blob>()
    form.forEach((part, key) => {
      if (key === 'rpc') {
        return
      }
      if (typeof part === 'string') {
        throw badRequest('File part must be binary')
      }
      if (parts.has(key)) {
        throw badRequest('Duplicate file part')
      }
      if (parts.size >= this.maxFiles) {
        throw badRequest('Too many files')
      }
      if (part.size > this.maxFileSize) {
        throw badRequest('File too large')
      }
      parts.set(key, fileFromPart(part))
    })
    return { json, parts }
  }
}
