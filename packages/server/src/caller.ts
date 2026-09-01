import type { ContractClient } from '@ts-pf/contract'
import {
  type ImplementedProcedure,
  type ImplementedRouter,
  isImplementedProcedure,
  runProcedure,
} from './runtime.js'

function createNode(
  node: ImplementedProcedure | ImplementedRouter<unknown>,
  context: unknown,
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
        return runProcedure(node, undefined, context, signal)
      }
      const signal = second?.signal
      return signal
        ? runProcedure(node, first, context, signal)
        : runProcedure(node, first, context)
    }
  }
  const nested: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(node)) {
    if (key === '~pf') {
      continue
    }
    if (child) {
      nested[key] = createNode(child, context)
    }
  }
  return nested
}

export function createLocalClient<T>(
  router: ImplementedRouter<T>,
  opts: { context: unknown },
): ContractClient<T> {
  return createNode(router, opts.context) as ContractClient<T>
}
