import {
  type ContractBuilder,
  type ContractProcedure,
  isContractProcedure,
} from '@ts-pf/contract'
import type { MiddlewareFn } from './middleware.js'
import {
  type HandlerFn,
  type ImplementedProcedure,
  type ImplementedRouter,
  isImplementedProcedure,
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
      },
    }
  }
  const result: Record<string, ImplementedProcedure | ImplementedRouter> = {}
  for (const [key, child] of Object.entries(node)) {
    if (key === '~pf') {
      continue
    }
    if (child) {
      result[key] = applyInherited(child, inherited)
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
  const extraUse: MiddlewareFn[] = []
  const extraUseAfter: MiddlewareFn[] = []

  const self: Record<string | symbol, unknown> = {
    $context() {
      return createNode(contract, inherited)
    },
    use(mw: MiddlewareFn) {
      return createNode(contract, { ...inherited, use: [...inherited.use, mw] })
    },
    useAfter(mw: MiddlewareFn) {
      return createNode(contract, {
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

  if (isContractProcedure(contract)) {
    self.handler = (fn: HandlerFn) =>
      createImplemented(contract, inherited, extraUse, extraUseAfter, fn)
    self.use = (mw: MiddlewareFn) => {
      extraUse.push(mw)
      return new Proxy(self, procedureProxy)
    }
    self.useAfter = (mw: MiddlewareFn) => {
      extraUseAfter.push(mw)
      return new Proxy(self, procedureProxy)
    }
  }

  const procedureProxy: ProxyHandler<typeof self> = {
    get(target, key) {
      if (key in target) {
        return target[key]
      }
      return undefined
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

export function implement<T>(contract: T) {
  return createNode(contract, {
    use: [],
    useAfter: [],
    path: [],
  }) as Implementer<T, object>
}

export type ProcedureBuilder<
  TInput,
  TOutput,
  TCtx,
  TErrors extends Record<string, unknown> = Record<string, unknown>,
> = {
  use: (
    mw: MiddlewareFn<TCtx, unknown, TOutput>,
  ) => ProcedureBuilder<TInput, TOutput, TCtx, TErrors>
  useAfter: (
    mw: MiddlewareFn<TCtx, TInput, TOutput>,
  ) => ProcedureBuilder<TInput, TOutput, TCtx, TErrors>
  handler: (
    fn: (opts: {
      input: TInput
      context: TCtx
      errors: import('./middleware.js').ErrorFactory<TErrors>
      path: string[]
    }) => TOutput | Promise<TOutput>,
  ) => ImplementedProcedure
}

export type Implementer<T, TCtx> = {
  $context: <C>() => Implementer<T, C>
  use: (mw: MiddlewareFn<TCtx, unknown, unknown>) => Implementer<T, TCtx>
  useAfter: (mw: MiddlewareFn<TCtx, unknown, unknown>) => Implementer<T, TCtx>
  middleware: (
    fn: MiddlewareFn<TCtx, unknown, unknown>,
  ) => MiddlewareFn<TCtx, unknown, unknown>
  router: (impl: RouterImpl<T, TCtx>) => ImplementedRouter<T>
} & {
  [K in keyof T as K extends '~pf' ? never : K]: T[K] extends ContractBuilder<
    infer I,
    infer O,
    infer _E,
    infer _M
  >
    ? ProcedureBuilder<I, O, TCtx, _E>
    : T[K] extends ContractProcedure<infer I, infer O, infer _E, infer _M>
      ? ProcedureBuilder<I, O, TCtx, _E>
      : Implementer<T[K], TCtx>
}

export type RouterImpl<T, TCtx> = {
  [K in keyof T as K extends '~pf' ? never : K]: T[K] extends ContractBuilder<
    infer _I,
    infer _O,
    infer _E,
    infer _M
  >
    ? ImplementedProcedure
    : T[K] extends ContractProcedure<infer _I, infer _O, infer _E, infer _M>
      ? ImplementedProcedure
      : RouterImpl<T[K], TCtx>
}
