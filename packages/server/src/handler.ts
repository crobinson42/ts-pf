import {
  JSONCodec,
  PFError,
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
  isPFError,
  parseProcedurePath,
  type RpcCodec,
} from '@ts-pf/protocol'
import type { HandlerPlugin } from './plugins.js'
import {
  lookupProcedure,
  runProcedure,
  type ImplementedRouter,
} from './runtime.js'

export type HandleResult =
  | { matched: false; response?: undefined }
  | { matched: true; response: Response }

export class RPCHandler<TCtx = unknown> {
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
          response: this.errorResponse(
            new PFError({
              code: 'METHOD_NOT_ALLOWED',
              status: 405,
              message: 'Method not allowed',
            }),
          ),
        }
      }

      const body = await request.text()
      const decoded = this.codec.decodeRequest(body.length > 0 ? body : '{}')
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
          ? await (opts.context as (req: Request) => TCtx | Promise<TCtx>)(request)
          : opts.context

      const output = await runProcedure(procedure, decoded.input, context)
      let response = this.successResponse(output)
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
        return { matched: true, response: this.errorResponse(error) }
      }
      return {
        matched: true,
        response: this.errorResponse(
          new PFError({
            code: 'INTERNAL',
            status: 500,
            message: 'Internal server error',
          }),
        ),
      }
    }
  }

  private successResponse(output: unknown): Response {
    return new Response(this.codec.encodeSuccess(output), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        [PROTOCOL_HEADER]: PROTOCOL_VERSION,
      },
    })
  }

  private errorResponse(error: PFError): Response {
    return new Response(this.codec.encodeFailure(error.toJSON()), {
      status: error.status,
      headers: {
        'content-type': 'application/json',
        [PROTOCOL_HEADER]: PROTOCOL_VERSION,
      },
    })
  }
}
