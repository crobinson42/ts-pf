import type { ContractClient } from '@ts-pf/contract'
import { defined } from '@ts-pf/protocol'
import {
  type CallInterceptor,
  createLocalClient,
  type ImplementedRouter,
  lookupProcedure,
  runProcedure,
} from '@ts-pf/server'
import type { MaybePromise } from './infer.js'
import type { McpCallInfo } from './types.js'

/** Where tools run: the contract defines them, an executor only runs them. */
export interface Executor {
  context(info: McpCallInfo): Promise<unknown>
  run(
    path: string,
    input: unknown,
    context: unknown,
    info: McpCallInfo,
  ): Promise<unknown>
  /** The typed `call` client mappers get, on the same executor. */
  client(context: unknown, info: McpCallInfo): ContractClient<unknown>
}

/** In-process: `lookupProcedure` + `runProcedure`, so middleware, auth, and interceptors all run. */
export function appExecutor(
  app: ImplementedRouter,
  context: ((info: McpCallInfo) => MaybePromise<unknown>) | undefined,
  interceptors: readonly CallInterceptor[] | undefined,
): Executor {
  const chain =
    interceptors && interceptors.length > 0 ? interceptors : undefined
  return {
    context: async (info) => context?.(info),
    async run(path, input, ctx, info) {
      const procedure = lookupProcedure(app, path.split('.'))
      if (!procedure) {
        throw new Error(`No procedure at "${path}" in the bound app`)
      }
      return runProcedure(
        procedure,
        input,
        ctx,
        defined({ signal: info.signal, interceptors: chain }),
      )
    },
    client: (ctx) =>
      chain
        ? createLocalClient(app, { context: ctx, interceptors: chain })
        : createLocalClient(app, { context: ctx }),
  }
}

type AnyClient = ContractClient<unknown>
export type ClientSource<C> = C | ((info: McpCallInfo) => C)

function procedureAt(client: unknown, path: string) {
  let node = client as Record<string, unknown> | undefined
  for (const segment of path.split('.')) {
    node = node?.[segment] as Record<string, unknown> | undefined
  }
  if (typeof node !== 'function') {
    throw new Error(`No procedure at "${path}" on the bound client`)
  }
  return node as (input: unknown, opts: { signal?: AbortSignal }) => unknown
}

/**
 * `createClient()` returns a callable proxy, so `typeof` cannot tell it from a
 * per-caller `(info) => client`. A client answers every key with a callable
 * child; a plain factory function has no such key.
 */
function isClientFactory(
  source: ClientSource<AnyClient>,
): source is (info: McpCallInfo) => AnyClient {
  return (
    typeof source === 'function' &&
    typeof (source as unknown as Record<string, unknown>)['~ts-pf-mcp'] !==
      'function'
  )
}

/** Remote: calls a typed client, which may be built per caller (a gateway calling upstream as the user). */
export function clientExecutor(
  source: ClientSource<AnyClient>,
  context: ((info: McpCallInfo) => MaybePromise<unknown>) | undefined,
): Executor {
  const resolve = (info: McpCallInfo): AnyClient =>
    isClientFactory(source) ? source(info) : source
  return {
    context: async (info) => (context ? context(info) : {}),
    run: async (path, input, _ctx, info) =>
      procedureAt(resolve(info), path)(input, defined({ signal: info.signal })),
    client: (_ctx, info) => resolve(info),
  }
}
