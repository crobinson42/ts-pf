import { PFError } from '@ts-pf/protocol'
import type { HandlerPlugin } from './plugins.js'

export type RequestLimitPluginOptions = {
  maxBodySize: number
}

export class RequestLimitPlugin implements HandlerPlugin {
  readonly name = 'request-limit'
  private readonly maxBodySize: number

  constructor(options: RequestLimitPluginOptions) {
    this.maxBodySize = options.maxBodySize
  }

  onRequest({ request }: { request: Request }): Request | undefined {
    const contentLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > this.maxBodySize) {
      throw tooLarge()
    }
    if (!request.body) {
      return undefined
    }
    const maxBodySize = this.maxBodySize
    let size = 0
    const limited = request.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          size += chunk.byteLength
          if (size > maxBodySize) {
            controller.error(tooLarge())
            return
          }
          controller.enqueue(chunk)
        },
      }),
    )
    return new Request(request, {
      body: limited,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
  }
}

function tooLarge(): PFError {
  return new PFError({
    code: 'PAYLOAD_TOO_LARGE',
    message: 'Request body too large',
  })
}
