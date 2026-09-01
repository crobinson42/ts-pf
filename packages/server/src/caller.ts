import type { ContractClient } from '@ts-pf/contract'
import {
  isImplementedProcedure,
  runProcedure,
  type ImplementedProcedure,
  type ImplementedRouter,
} from './runtime.js'

function createNode(
  node: ImplementedProcedure | ImplementedRouter<unknown>,
  context: unknown,
): unknown {
  if (isImplementedProcedure(node)) {
    return (...args: unknown[]) => runProcedure(node, args[0], context)
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

export function createRouterClient<T>(
  router: ImplementedRouter<T>,
  opts: { context: unknown },
): ContractClient<T> {
  return createNode(router, opts.context) as ContractClient<T>
}
