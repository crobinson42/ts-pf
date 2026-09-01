import {
  isPFError,
  JSONCodec,
  PFError,
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
  parseProcedurePath,
  type RpcBodySource,
  type RpcCodec,
  type RpcEncodedBody,
} from '@ts-pf/protocol'
import type { HandlerPlugin } from './plugins.js'
import {
  type ImplementedRouter,
  lookupProcedure,
  runProcedure,
} from './runtime.js'

export type HandleResult =
  | { matched: false; response?: undefined }
  | { matched: true; response: Response }

export class FetchHandler<TCtx = unknown> {
  private readonly codec: RpcCodec
  private readonly plugins: HandlerPlugin[]

  constructor(
    private readonly router: ImplementedRouter,
    options?: { codec?: RpcCodec; plugins?: HandlerPlugin[] },
  ) {
    this.codec = options?.codec ?? new JSONCodec()
    this.plugins = options?.plugins ?? []
  }

  async handle(
    request: Request,
    opts: {
      prefix: string
      context: TCtx | ((req: Request) => TCtx | Promise<TCtx>)
    },
  ): Promise<HandleResult> {
    const url = new URL(request.url)
    const path = parseProcedurePath(url.pathname, opts.prefix)
    if (path === null) {
      return { matched: false }
    }

    try {
      for (const plugin of this.plugins) {
        await plugin.onRequest?.({ request })
      }

      if (request.method !== 'POST') {
        return {
          matched: true,
          response: await this.errorResponse(
            new PFError({
              code: 'METHOD_NOT_ALLOWED',
              status: 405,
              message: 'Method not allowed',
            }),
          ),
        }
      }

      const decoded = await this.codec.decodeRequest(bodySource(request))
      const procedure = lookupProcedure(this.router, path)
      if (!procedure) {
        throw new PFError({
          code: 'NOT_FOUND',
          status: 404,
          message: 'Procedure not found',
        })
      }

      const context =
        typeof opts.context === 'function'
          ? await (opts.context as (req: Request) => TCtx | Promise<TCtx>)(
              request,
            )
          : opts.context

      const output = await runProcedure(
        procedure,
        decoded.input,
        context,
        request.signal,
      )
      let response = await this.successResponse(output)
      for (const plugin of this.plugins) {
        const next = await plugin.onResponse?.({ request, response })
        if (next) {
          response = next
        }
      }
      return { matched: true, response }
    } catch (error) {
      for (const plugin of this.plugins) {
        await plugin.onError?.({ request, error })
      }
      if (isPFError(error)) {
        return { matched: true, response: await this.errorResponse(error) }
      }
      return {
        matched: true,
        response: await this.errorResponse(
          new PFError({
            code: 'INTERNAL',
            status: 500,
            message: 'Internal server error',
          }),
        ),
      }
    }
  }

  private async successResponse(output: unknown): Promise<Response> {
    return encodedResponse(await this.codec.encodeSuccess(output), 200)
  }

  private async errorResponse(error: PFError): Promise<Response> {
    return encodedResponse(
      await this.codec.encodeFailure(error.toJSON()),
      error.status,
    )
  }
}

function bodySource(request: Request): RpcBodySource {
  return {
    contentType: request.headers.get('content-type'),
    text: () => request.text(),
    formData: () => request.formData(),
    body: () => request.body,
  }
}

function encodedResponse(encoded: RpcEncodedBody, status: number): Response {
  const headers = new Headers()
  headers.set(PROTOCOL_HEADER, PROTOCOL_VERSION)
  if (!(encoded.body instanceof FormData)) {
    headers.set('content-type', encoded.contentType)
  }
  if (encoded.body instanceof ReadableStream) {
    headers.set('cache-control', 'no-cache, no-transform')
    headers.set('x-accel-buffering', 'no')
  }
  return new Response(encoded.body, { status, headers })
}
