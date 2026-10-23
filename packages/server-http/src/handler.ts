import {
  httpStatus,
  JSONCodec,
  PROTOCOL_HEADER,
  parseProcedurePath,
  type RpcBodySource,
  type RpcCodec,
  type RpcEncodedBody,
} from '@ts-pf/http'
import { isPFError, PFError, PROTOCOL_VERSION } from '@ts-pf/protocol'
import {
  type CallInterceptor,
  type ImplementedRouter,
  lookupProcedure,
  type ProcedureValidation,
  type RunProcedureOptions,
  runProcedure,
} from '@ts-pf/server'
import type { HandlerPlugin } from './plugins.js'

export type HandleResult =
  | { matched: false; response?: undefined }
  | { matched: true; response: Response }

/** `FetchHandler` `onError` option. `context` is `unknown` like `HandlerPlugin`. */
export type FetchHandlerOnError = (
  error: unknown,
  info: { request: Request; path: readonly string[]; context: unknown },
) => void | Promise<void>

/**
 * `TCtx` is inferred from the router's context brand (the `$context<C>()`
 * type behind `impl.router()`), so `handle(request, { context })` is checked
 * against it. A tree not produced by `impl.router()` infers `unknown`. An
 * explicit `new FetchHandler<AppCtx>(app)` is still accepted when `AppCtx`
 * satisfies the router's context.
 */
export class FetchHandler<TCtx = unknown> {
  private readonly codec: RpcCodec
  private readonly plugins: HandlerPlugin[]
  private readonly interceptors: readonly CallInterceptor[]
  private readonly validation: ProcedureValidation | undefined
  private readonly onError: FetchHandlerOnError | undefined

  constructor(
    private readonly router: ImplementedRouter<unknown, TCtx>,
    options?: {
      codec?: RpcCodec
      plugins?: HandlerPlugin[]
      interceptors?: readonly CallInterceptor[]
      validation?: ProcedureValidation
      /**
       * Side-effect hook for every error that becomes an error response.
       * Receives the original thrown value (before an unknown throw is
       * mapped to `INTERNAL`), including `METHOD_NOT_ALLOWED`, `NOT_FOUND`,
       * codec `BAD_REQUEST`, and `VALIDATION`. Runs after every
       * `HandlerPlugin.onError` (array order) and before the failure is
       * encoded. It cannot replace the response. A `Response` returned from
       * `HandlerPlugin.onRequest` is not an error to this hook, and a throw
       * from `onError` itself rejects `handle()`. Errors thrown after a
       * streamed response has started are written in-band by the codec
       * (unknown throws as `INTERNAL`) and do not reach this hook or the
       * default log.
       *
       * When omitted, `FetchHandler` logs with `console.error`: unknown
       * (non-`PFError`) throws, and `INTERNAL` `PFError`s (an output schema
       * failure under `validation.output`, invalid declared error `data`, or
       * an explicit `INTERNAL` throw). Declared and other protocol errors are
       * not logged. Passing `onError` replaces that default logging entirely.
       */
      onError?: FetchHandlerOnError
    },
  ) {
    this.codec = options?.codec ?? new JSONCodec()
    this.plugins = options?.plugins ?? []
    this.interceptors = options?.interceptors ?? []
    this.validation = options?.validation
    this.onError = options?.onError
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
        throw new PFError({
          code: 'METHOD_NOT_ALLOWED',
          message: 'Method not allowed',
        })
      }

      const decoded = await this.codec.decodeRequest(bodySource(inbound))
      const procedure = lookupProcedure(this.router, path)
      if (!procedure) {
        throw new PFError({
          code: 'NOT_FOUND',
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

      const runOpts: RunProcedureOptions = { signal: inbound.signal }
      if (this.interceptors.length > 0) {
        runOpts.interceptors = this.interceptors
      }
      if (this.validation) {
        runOpts.validation = this.validation
      }
      const output = await runProcedure(
        procedure,
        decoded.input,
        context,
        runOpts,
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
      if (this.onError) {
        await this.onError(error, { request: inbound, path, context })
      } else {
        this.logError(error, path)
      }
      const failure = isPFError(error)
        ? error
        : new PFError({
            code: 'INTERNAL',
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

  private logError(error: unknown, path: readonly string[]): void {
    const where = `"${path.join('/')}"`
    if (!isPFError(error)) {
      console.error(`[ts-pf/server-http] Unhandled error in ${where}:`, error)
      return
    }
    if (error.code !== 'INTERNAL') {
      return
    }
    const causes =
      this.validation?.output === true
        ? 'output schema failure, invalid declared error data, or an INTERNAL throw'
        : 'invalid declared error data or an INTERNAL throw'
    console.error(
      `[ts-pf/server-http] INTERNAL error in ${where} (${causes}):`,
      error,
    )
  }

  private async successResponse(output: unknown): Promise<Response> {
    return encodedResponse(await this.codec.encodeSuccess(output), 200)
  }

  private async errorResponse(error: PFError): Promise<Response> {
    return encodedResponse(
      await this.codec.encodeFailure(error.toJSON()),
      httpStatus(error),
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
