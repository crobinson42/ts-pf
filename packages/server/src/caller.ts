import type { ContractClient } from '@ts-pf/contract'
import type { CallInterceptor } from './call-interceptor.js'
import { applyPlugins, type CallPlugin } from './plugin.js'
import {
  type ImplementedProcedure,
  type ImplementedRouter,
  isImplementedProcedure,
  type ProcedureValidation,
  type RunProcedureOptions,
  runProcedure,
} from './runtime.js'

/**
 * The caller-wide `runProcedure` options, built once per client: the
 * interceptor list and `validation` never change per call, only `signal`
 * does. `undefined` when there is nothing to pass.
 */
function buildRunOptions(
  interceptors: readonly CallInterceptor[],
  validation: ProcedureValidation | undefined,
): RunProcedureOptions | undefined {
  if (interceptors.length === 0 && !validation) {
    return undefined
  }
  const options: RunProcedureOptions = {}
  if (interceptors.length > 0) {
    options.interceptors = interceptors
  }
  if (validation) {
    options.validation = validation
  }
  return options
}

function withSignal(
  base: RunProcedureOptions | undefined,
  signal: AbortSignal | undefined,
): RunProcedureOptions | undefined {
  return signal ? { ...base, signal } : base
}

function createNode(
  node: ImplementedProcedure | ImplementedRouter<unknown>,
  context: unknown,
  base: RunProcedureOptions | undefined,
): unknown {
  if (isImplementedProcedure(node)) {
    return (...args: unknown[]) => {
      const first = args[0]
      const second = args[1] as { signal?: AbortSignal } | undefined
      if (
        args.length < 2 &&
        typeof first === 'object' &&
        first !== null &&
        'signal' in first &&
        (first as { signal?: unknown }).signal instanceof AbortSignal
      ) {
        const signal = (first as { signal: AbortSignal }).signal
        return runProcedure(node, undefined, context, withSignal(base, signal))
      }
      return runProcedure(
        node,
        first,
        context,
        withSignal(base, second?.signal),
      )
    }
  }
  const nested: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(node)) {
    if (key === '~pf') {
      continue
    }
    if (child) {
      nested[key] = createNode(child, context, base)
    }
  }
  return nested
}

/**
 * In-process typed client. `TCtx` is inferred from the router's context brand
 * (`impl.router()` output), so `context` is checked against `$context<C>()`.
 * A tree not produced by `impl.router()` infers `unknown`.
 */
export function createLocalClient<T, TCtx>(
  router: ImplementedRouter<T, TCtx>,
  opts: {
    context: NoInfer<TCtx>
    interceptors?: readonly CallInterceptor[]
    plugins?: readonly CallPlugin[]
    validation?: ProcedureValidation
  },
): ContractClient<T> {
  const interceptors = applyPlugins(opts.plugins ?? [], opts.interceptors)
  return createNode(
    router,
    opts.context,
    buildRunOptions(interceptors, opts.validation),
  ) as ContractClient<T>
}
