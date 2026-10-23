import {
  type ContractProcedure,
  type IsContractProcedure,
  isContractProcedure,
} from '@ts-pf/contract'
import type { MiddlewareFn } from './middleware.js'
import {
  type ContractKeys,
  type ContractShape,
  type HandlerFn,
  type ImplementedProcedure,
  type ImplementedRouter,
  isImplementedProcedure,
  type RouterImplCheck,
} from './runtime.js'

type Inherited = {
  use: MiddlewareFn[]
  useAfter: MiddlewareFn[]
  path: string[]
}

function createImplemented(
  contract: ContractProcedure,
  inherited: Inherited,
  extraUse: MiddlewareFn[],
  extraUseAfter: MiddlewareFn[],
  handler: HandlerFn,
): ImplementedProcedure {
  return {
    '~pf': {
      type: 'implemented-procedure',
      contract,
      use: [...inherited.use, ...extraUse],
      useAfter: [...inherited.useAfter, ...extraUseAfter],
      handler,
      path: inherited.path,
    },
  }
}

function applyInherited(
  node: ImplementedProcedure | ImplementedRouter,
  inherited: Inherited,
): ImplementedProcedure | ImplementedRouter {
  if (isImplementedProcedure(node)) {
    return {
      '~pf': {
        ...node['~pf'],
        use: [...inherited.use, ...node['~pf'].use],
        useAfter: [...inherited.useAfter, ...node['~pf'].useAfter],
        path: inherited.path,
      },
    }
  }
  const result: Record<string, ImplementedProcedure | ImplementedRouter> = {}
  for (const [key, child] of Object.entries(node)) {
    if (key === '~pf') {
      continue
    }
    if (child) {
      result[key] = applyInherited(child, {
        ...inherited,
        path: [...inherited.path, key],
      })
    }
  }
  return result
}

function assertComplete(
  contract: unknown,
  impl: unknown,
  path: string[],
): void {
  if (isContractProcedure(contract)) {
    if (!isImplementedProcedure(impl)) {
      throw new Error(
        `Missing implementation at "${path.join('.') || '<root>'}"`,
      )
    }
    return
  }
  if (typeof contract !== 'object' || contract === null) {
    return
  }
  if (typeof impl !== 'object' || impl === null) {
    throw new Error(`Missing implementation at "${path.join('.') || '<root>'}"`)
  }
  const contractKeys = Object.keys(contract).filter((key) => key !== '~pf')
  const implKeys = Object.keys(impl).filter((key) => key !== '~pf')
  for (const key of contractKeys) {
    if (!(key in (impl as object))) {
      throw new Error(`Missing implementation at "${[...path, key].join('.')}"`)
    }
    assertComplete(
      (contract as Record<string, unknown>)[key],
      (impl as Record<string, unknown>)[key],
      [...path, key],
    )
  }
  for (const key of implKeys) {
    if (!(key in (contract as object))) {
      throw new Error(
        `Unexpected implementation key "${[...path, key].join('.')}"`,
      )
    }
  }
}

function createNode(contract: unknown, inherited: Inherited): object {
  return isContractProcedure(contract)
    ? createProcedureNode(contract, inherited)
    : createRouterNode(contract, inherited)
}

/**
 * Router level of the implementer (`impl`, `impl.planet`). Immutable: `use()`
 * / `useAfter()` / `$context()` return a fresh node with the middleware added
 * to `inherited`, so `impl.use(a)` does not change `impl`. Property access
 * walks the contract and builds a child node per access.
 */
function createRouterNode(contract: unknown, inherited: Inherited): object {
  const self: Record<string | symbol, unknown> = {
    $context() {
      return createRouterNode(contract, inherited)
    },
    use(mw: MiddlewareFn) {
      return createRouterNode(contract, {
        ...inherited,
        use: [...inherited.use, mw],
      })
    },
    useAfter(mw: MiddlewareFn) {
      return createRouterNode(contract, {
        ...inherited,
        useAfter: [...inherited.useAfter, mw],
      })
    },
    middleware(fn: MiddlewareFn) {
      return fn
    },
    router(impl: ImplementedRouter) {
      assertComplete(contract, impl, inherited.path)
      return applyInherited(impl, inherited) as ImplementedRouter
    },
  }

  return new Proxy(self, {
    get(target, key) {
      if (key in target) {
        return target[key]
      }
      if (typeof key === 'symbol' || key === '~pf') {
        return undefined
      }
      if (typeof contract !== 'object' || contract === null) {
        return undefined
      }
      const child = (contract as Record<string, unknown>)[key]
      if (child === undefined) {
        return undefined
      }
      return createNode(child, { ...inherited, path: [...inherited.path, key] })
    },
  })
}

/**
 * Procedure level (`impl.planet.find`). A short-lived builder: `use()` /
 * `useAfter()` push onto this node's own arrays and return the same node, and
 * `handler()` seals them behind the inherited router middleware. Each access
 * of `impl.planet.find` makes a new node, so the mutation never leaks past
 * the chain it was written in.
 */
function createProcedureNode(
  contract: ContractProcedure,
  inherited: Inherited,
): object {
  const extraUse: MiddlewareFn[] = []
  const extraUseAfter: MiddlewareFn[] = []
  const self = {
    use(mw: MiddlewareFn) {
      extraUse.push(mw)
      return self
    },
    useAfter(mw: MiddlewareFn) {
      extraUseAfter.push(mw)
      return self
    },
    handler(fn: HandlerFn) {
      return createImplemented(contract, inherited, extraUse, extraUseAfter, fn)
    },
  }
  return self
}

export function createImplementer<T>(contract: T) {
  return createNode(contract, {
    use: [],
    useAfter: [],
    path: [],
  }) as Implementer<T, object>
}

/**
 * Builder for one contract procedure. `TContract` is the contract procedure
 * type (`typeof contract.planet.find`); `handler()` returns an
 * `ImplementedProcedure` branded with it and with `TCtx`.
 *
 * `use()` runs before input validation and takes the same loose
 * `MiddlewareFn<TCtx, unknown, unknown>` as `impl.use()`, so a middleware
 * from `impl.middleware()` fits both. `useAfter()` is typed with this
 * procedure's input and output, so it takes an inline function.
 */
export type ProcedureBuilder<
  TInput,
  TOutput,
  TCtx,
  TErrors extends Record<string, unknown> = Record<string, unknown>,
  TContract = unknown,
> = {
  use: (
    mw: MiddlewareFn<TCtx, unknown, unknown>,
  ) => ProcedureBuilder<TInput, TOutput, TCtx, TErrors, TContract>
  useAfter: (
    mw: MiddlewareFn<TCtx, TInput, TOutput>,
  ) => ProcedureBuilder<TInput, TOutput, TCtx, TErrors, TContract>
  handler: (
    fn: (opts: {
      input: TInput
      context: TCtx
      errors: import('./middleware.js').ErrorFactory<TErrors>
      path: string[]
      signal?: AbortSignal
    }) => TOutput | Promise<TOutput>,
  ) => ImplementedProcedure<TContract, TCtx>
}

export type Implementer<T, TCtx> = {
  $context: <C>() => Implementer<T, C>
  use: (mw: MiddlewareFn<TCtx, unknown, unknown>) => Implementer<T, TCtx>
  useAfter: (mw: MiddlewareFn<TCtx, unknown, unknown>) => Implementer<T, TCtx>
  middleware: (
    fn: MiddlewareFn<TCtx, unknown, unknown>,
  ) => MiddlewareFn<TCtx, unknown, unknown>
  /**
   * Builds the finished tree. The argument must implement exactly the
   * contract: a missing key, an extra key, a handler built from another
   * procedure, or a slice built with a different `$context` is a type error
   * that names the key. `I` is inferred so the error shows that key, not the
   * whole contract. Runtime `assertComplete` enforces the same.
   */
  router: <I>(
    impl: I & RouterImplCheck<T, TCtx, I>,
  ) => ImplementedRouter<T, TCtx>
} & {
  [K in ContractKeys<T>]: IsContractProcedure<T[K]> extends true
    ? ProcedureBuilderFor<T[K], TCtx>
    : Implementer<T[K], TCtx>
}

type ProcedureBuilderFor<TContract, TCtx> =
  ContractShape<TContract> extends {
    input: infer I
    output: infer O
    errors: infer E extends Record<string, unknown>
  }
    ? ProcedureBuilder<I, O, TCtx, E, TContract>
    : never
