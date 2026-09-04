import type { ContractClient } from '@ts-pf/contract'
import type { CallInterceptor } from './call-interceptor.js'
import { applyPlugins, type CallPlugin } from './plugin.js'
import {
  type ImplementedProcedure,
  type ImplementedRouter,
  isImplementedProcedure,
  type RunProcedureOptions,
  runProcedure,
} from './runtime.js'

function buildRunOptions(
  signal: AbortSignal | undefined,
  interceptors: readonly CallInterceptor[],
): RunProcedureOptions | undefined {
  if (!signal && interceptors.length === 0) {
    return undefined
  }
  const options: RunProcedureOptions = {}
  if (signal) {
    options.signal = signal
  }
  if (interceptors.length > 0) {
    options.interceptors = interceptors
  }
  return options
}

function createNode(
  node: ImplementedProcedure | ImplementedRouter<unknown>,
  context: unknown,
  interceptors: readonly CallInterceptor[],
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
        const options = buildRunOptions(signal, interceptors)
        return options
          ? runProcedure(node, undefined, context, options)
          : runProcedure(node, undefined, context)
      }
      const options = buildRunOptions(second?.signal, interceptors)
      return options
        ? runProcedure(node, first, context, options)
        : runProcedure(node, first, context)
    }
  }
  const nested: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(node)) {
    if (key === '~pf') {
      continue
    }
    if (child) {
      nested[key] = createNode(child, context, interceptors)
    }
  }
  return nested
}

export function createLocalClient<T>(
  router: ImplementedRouter<T>,
  opts: {
    context: unknown
    interceptors?: readonly CallInterceptor[]
    plugins?: readonly CallPlugin[]
  },
): ContractClient<T> {
  const interceptors = applyPlugins(opts.plugins ?? [], opts.interceptors)
  return createNode(router, opts.context, interceptors) as ContractClient<T>
}
