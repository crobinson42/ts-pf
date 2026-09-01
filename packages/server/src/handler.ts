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

    let inbound = request
    let context: TCtx | undefined

    try {
      for (const plugin of this.plugins) {
        const result = await plugin.onRequest?.({ request: inbound })
        if (result instanceof Response) {
          return {
            matched: true,
            response: await this.applyOnResponse(inbound, result, context),
          }
        }
        if (result instanceof Request) {
          inbound = result
        }
      }

      if (inbound.method !== 'POST') {
        return {
          matched: true,
          response: await this.applyOnResponse(
            inbound,
            await this.errorResponse(
              new PFError({
                code: 'METHOD_NOT_ALLOWED',
                status: 405,
                message: 'Method not allowed',
              }),
            ),
            context,
          ),
        }
      }

      const decoded = await this.codec.decodeRequest(bodySource(inbound))
      const procedure = lookupProcedure(this.router, path)
      if (!procedure) {
        throw new PFError({
          code: 'NOT_FOUND',
          status: 404,
          message: 'Procedure not found',
        })
      }

      context =
        typeof opts.context === 'function'
          ? await (opts.context as (req: Request) => TCtx | Promise<TCtx>)(
              inbound,
            )
          : opts.context

      for (const plugin of this.plugins) {
        const next = await plugin.onContext?.({
          request: inbound,
          context,
        })
        if (next !== undefined) {
          context = next as TCtx
        }
      }

      const output = await runProcedure(
        procedure,
        decoded.input,
        context,
        inbound.signal,
      )
      const response = await this.successResponse(output)
      return {
        matched: true,
        response: await this.applyOnResponse(inbound, response, context),
      }
    } catch (error) {
      for (const plugin of this.plugins) {
        await plugin.onError?.(
          context === undefined
            ? { request: inbound, error }
            : { request: inbound, error, context },
        )
      }
      const failure = isPFError(error)
        ? error
        : new PFError({
            code: 'INTERNAL',
            status: 500,
            message: 'Internal server error',
          })
      return {
        matched: true,
        response: await this.applyOnResponse(
          inbound,
          await this.errorResponse(failure),
          context,
        ),
      }
    }
  }

  private async applyOnResponse(
    request: Request,
    response: Response,
    context: TCtx | undefined,
  ): Promise<Response> {
    let current = response
    for (const plugin of this.plugins) {
      const next = await plugin.onResponse?.(
        context === undefined
          ? { request, response: current }
          : { request, response: current, context },
      )
      if (next) {
        current = next
      }
    }
    return current
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
