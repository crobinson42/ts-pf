import type { ContractClient } from '@ts-pf/contract'
import {
  type CallInterceptor,
  type CallPlugin,
  createLocalClient,
  type ImplementedRouter,
  type ProcedureValidation,
} from '@ts-pf/server'
import type { FetchHandler } from '@ts-pf/server-http'
import type { APIContext } from 'astro'

export type AstroHandlerOptions<TCtx> = {
  prefix: string
  context: TCtx | ((astro: APIContext) => TCtx | Promise<TCtx>)
}

export type AstroLocalClientOptions = {
  interceptors?: readonly CallInterceptor[]
  plugins?: readonly CallPlugin[]
  validation?: ProcedureValidation
}

export function createAstroHandler<TCtx>(
  handler: FetchHandler<TCtx>,
  options: AstroHandlerOptions<TCtx>,
): (context: APIContext) => Promise<Response> {
  return async (astro) => {
    const context = await resolveContext(options.context, astro)
    const result = await handler.handle(astro.request, {
      prefix: options.prefix,
      context,
    })
    if (!result.matched) {
      return new Response('Not Found', { status: 404 })
    }
    return result.response
  }
}

export async function createAstroLocalClient<
  TApp,
  TAstro extends { request: Request },
  TCtx,
>(
  app: ImplementedRouter<TApp>,
  astro: TAstro,
  context: TCtx | ((astro: TAstro) => TCtx | Promise<TCtx>),
  options?: AstroLocalClientOptions,
): Promise<ContractClient<TApp>> {
  const resolved = await resolveContext(context, astro)
  return createLocalClient(app, localClientOptions(resolved, options))
}

// A function is the context factory. Context values are plain data.
async function resolveContext<TAstro, TCtx>(
  context: TCtx | ((astro: TAstro) => TCtx | Promise<TCtx>),
  astro: TAstro,
): Promise<TCtx> {
  if (typeof context === 'function') {
    const factory = context as (astro: TAstro) => TCtx | Promise<TCtx>
    return factory(astro)
  }
  return context
}

function localClientOptions<TCtx>(
  context: TCtx,
  options: AstroLocalClientOptions | undefined,
): {
  context: TCtx
  interceptors?: readonly CallInterceptor[]
  plugins?: readonly CallPlugin[]
  validation?: ProcedureValidation
} {
  const opts: {
    context: TCtx
    interceptors?: readonly CallInterceptor[]
    plugins?: readonly CallPlugin[]
    validation?: ProcedureValidation
  } = { context }
  if (!options) {
    return opts
  }
  if (options.interceptors !== undefined) {
    opts.interceptors = options.interceptors
  }
  if (options.plugins !== undefined) {
    opts.plugins = options.plugins
  }
  if (options.validation !== undefined) {
    opts.validation = options.validation
  }
  return opts
}

export { withBase } from './with-base.js'
