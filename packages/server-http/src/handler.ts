import {
  httpStatus,
  JSONCodec,
  PROTOCOL_HEADER,
  PROTOCOL_HTTP_STATUS,
  parseProcedurePath,
  type RpcBodySource,
  type RpcCodec,
  type RpcEncodedBody,
} from '@ts-pf/http'
import {
  isPFError,
  PFError,
  PROTOCOL_VERSION,
  toWireError,
} from '@ts-pf/protocol'
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
 * What the pipeline steps have built so far for one request. Steps mutate it
 * in place, so the error path sees the latest wrapped `request` and the
 * context as far as it got (the factory result, then each `onContext`
 * replacement) — exactly what a throw mid-step leaves behind.
 */
type CallState<TCtx> = {
  request: Request
  context: TCtx | undefined
}

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

  /**
   * The call pipeline (see the ts-pf skill, "Call pipeline"): each numbered
   * step is a method below. Any throw from steps 0–5, including
   * `METHOD_NOT_ALLOWED`, `NOT_FOUND`, codec `BAD_REQUEST`, and an
   * `onResponse` plugin on the success path, takes the step-6 error path.
   */
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

    const state: CallState<TCtx> = { request, context: undefined }
    try {
      // 0. HandlerPlugin.onRequest: wrap the request or short-circuit (CORS preflight)
      const shortCircuit = await this.applyOnRequest(state)
      if (shortCircuit !== undefined) {
        return await this.respond(state, shortCircuit)
      }
      // 1–2. method, body, procedure
      assertPost(state.request)
      const decoded = await this.codec.decodeRequest(bodySource(state.request))
      const procedure = this.lookup(path)
      // 3. context factory, then HandlerPlugin.onContext
      state.context = await resolveContext(state.request, opts.context)
      await this.applyOnContext(state)
      // 4–5. call-interceptor onion around runProcedure, then encode
      const output = await this.run(procedure, decoded.input, state)
      return await this.respond(state, await this.successResponse(output))
    } catch (error) {
      // 6. HandlerPlugin.onError, then onError or the default log, then encode the failure
      await this.reportError(error, state, path)
      return this.respond(state, await this.errorResponse(error))
    }
  }

  /** Step 0. Returns a plugin's short-circuit `Response`; `state.request` holds the latest wrap. */
  private async applyOnRequest(
    state: CallState<TCtx>,
  ): Promise<Response | undefined> {
    for (const plugin of this.plugins) {
      const result = await plugin.onRequest?.({ request: state.request })
      if (result instanceof Response) {
        return result
      }
      if (result instanceof Request) {
        state.request = result
      }
    }
    return undefined
  }

  /** Step 2. Prefix matched but no procedure at `path`: `NOT_FOUND` (no call interceptors). */
  private lookup(path: string[]) {
    const procedure = lookupProcedure(this.router, path)
    if (!procedure) {
      throw new PFError({
        code: 'NOT_FOUND',
        message: 'Procedure not found',
      })
    }
    return procedure
  }

  /** Step 3. Each `onContext` may replace the context (header bags). */
  private async applyOnContext(state: CallState<TCtx>): Promise<void> {
    for (const plugin of this.plugins) {
      const next = await plugin.onContext?.({
        request: state.request,
        context: state.context,
      })
      if (next !== undefined) {
        state.context = next as TCtx
      }
    }
  }

  /** Step 4. `runProcedure` with the request signal, interceptors, and validation. */
  private run(
    procedure: ReturnType<typeof this.lookup>,
    input: unknown,
    state: CallState<TCtx>,
  ): Promise<unknown> {
    const runOpts: RunProcedureOptions = { signal: state.request.signal }
    if (this.interceptors.length > 0) {
      runOpts.interceptors = this.interceptors
    }
    if (this.validation) {
      runOpts.validation = this.validation
    }
    return runProcedure(procedure, input, state.context, runOpts)
  }

  /** Step 5. */
  private async successResponse(output: unknown): Promise<Response> {
    return encodedResponse(await this.codec.encodeSuccess(output), 200)
  }

  /** Step 6, side effects: `HandlerPlugin.onError` in array order, then `onError` or the default log. */
  private async reportError(
    error: unknown,
    state: CallState<TCtx>,
    path: readonly string[],
  ): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.onError?.(
        state.context === undefined
          ? { request: state.request, error }
          : { request: state.request, error, context: state.context },
      )
    }
    if (this.onError) {
      await this.onError(error, {
        request: state.request,
        path,
        context: state.context,
      })
      return
    }
    this.logError(error, path)
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

  /** Step 6, response: `toWireError` maps an unknown throw to `INTERNAL`; its status follows. */
  private async errorResponse(error: unknown): Promise<Response> {
    return encodedResponse(
      await this.codec.encodeFailure(toWireError(error)),
      isPFError(error) ? httpStatus(error) : PROTOCOL_HTTP_STATUS.INTERNAL,
    )
  }

  /** Step 7. Every matched `Response` (success, 405, errors, short-circuit) passes `onResponse`. */
  private async respond(
    state: CallState<TCtx>,
    response: Response,
  ): Promise<HandleResult> {
    return {
      matched: true,
      response: await this.applyOnResponse(
        state.request,
        response,
        state.context,
      ),
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
}

/** Step 1. Thrown inside the pipeline so plugins and `onError` see 405s too. */
function assertPost(request: Request): void {
  if (request.method !== 'POST') {
    throw new PFError({
      code: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed',
    })
  }
}

/** Step 3, factory half: a value or a `(req) => ctx` function. */
async function resolveContext<TCtx>(
  request: Request,
  context: TCtx | ((req: Request) => TCtx | Promise<TCtx>),
): Promise<TCtx> {
  return typeof context === 'function'
    ? await (context as (req: Request) => TCtx | Promise<TCtx>)(request)
    : context
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
