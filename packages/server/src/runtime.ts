import {
  type ContractProcedure,
  type ErrorMap,
  isContractProcedure,
  validateSchema,
} from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import {
  type CallInterceptor,
  runCallInterceptors,
} from './call-interceptor.js'
import { createErrorFactory, finalizeDeclaredError } from './error-factory.js'
import type { MiddlewareFn } from './middleware.js'

export type HandlerFn = (opts: {
  input: unknown
  context: unknown
  errors: ReturnType<typeof createErrorFactory>
  path: string[]
  signal?: AbortSignal
}) => unknown | Promise<unknown>

export type ImplementedProcedure = {
  readonly '~pf': {
    type: 'implemented-procedure'
    contract: ContractProcedure
    use: MiddlewareFn[]
    useAfter: MiddlewareFn[]
    handler: HandlerFn
    path: string[]
  }
}

declare const contractBrand: unique symbol

export type ImplementedRouter<T = unknown> = {
  readonly [key: string]: ImplementedProcedure | ImplementedRouter | undefined
} & { readonly [contractBrand]?: T }

export function isImplementedProcedure(
  value: unknown,
): value is ImplementedProcedure {
  return (
    typeof value === 'object' &&
    value !== null &&
    '~pf' in value &&
    (value as ImplementedProcedure)['~pf']?.type === 'implemented-procedure'
  )
}

export type RunProcedureOptions = {
  signal?: AbortSignal
  interceptors?: readonly CallInterceptor[]
}

export async function runProcedure(
  proc: ImplementedProcedure,
  rawInput: unknown,
  context: unknown,
  options?: RunProcedureOptions,
): Promise<unknown> {
  const def = proc['~pf']
  const errors = createErrorFactory(def.contract['~pf'].errors)
  let ctx: Record<string, unknown> = { ...(context as Record<string, unknown>) }
  let input = rawInput
  let signal = options?.signal

  const runUseAfter = async (index: number): Promise<unknown> => {
    const mw = def.useAfter[index]
    if (!mw) {
      const output = await def.handler({
        input,
        context: ctx,
        errors,
        path: def.path,
        ...(signal ? { signal } : {}),
      })
      const outputSchema = def.contract['~pf'].output
      if (outputSchema) {
        const result = await validateSchema(outputSchema, output)
        if (!result.success) {
          throw new PFError({
            code: 'INTERNAL',
            message: 'Internal server error',
          })
        }
        return result.value
      }
      return output
    }
    return mw({
      context: ctx,
      input,
      errors,
      path: def.path,
      next: async (opts) => {
        if (opts?.context) {
          ctx = { ...ctx, ...opts.context }
        }
        if (opts && 'input' in opts) {
          input = opts.input
        }
        return runUseAfter(index + 1)
      },
    })
  }

  const runUse = async (index: number): Promise<unknown> => {
    const mw = def.use[index]
    if (!mw) {
      const inputSchema = def.contract['~pf'].input
      if (inputSchema) {
        const result = await validateSchema(inputSchema, input)
        if (!result.success) {
          throw new PFError({
            code: 'VALIDATION',
            message: 'Validation failed',
            data: { issues: result.issues },
          })
        }
        input = result.value
      }
      return runUseAfter(0)
    }
    return mw({
      context: ctx,
      input,
      errors,
      path: def.path,
      next: async (opts) => {
        if (opts?.context) {
          ctx = { ...ctx, ...opts.context }
        }
        if (opts && 'input' in opts) {
          input = opts.input
        }
        return runUse(index + 1)
      },
    })
  }

  const map = def.contract['~pf'].errors
  const interceptors = options?.interceptors
  if (!interceptors?.length) {
    try {
      const output = await runUse(0)
      return wrapIfAsyncIterable(output, map)
    } catch (error) {
      return await finalizeDeclaredError(error, map)
    }
  }

  return runCallInterceptors(
    interceptors,
    {
      procedure: proc,
      path: def.path,
      input: rawInput,
      context,
      ...(signal ? { signal } : {}),
    },
    async (current) => {
      input = current.input
      ctx = { ...(current.context as Record<string, unknown>) }
      signal = current.signal
      try {
        const output = await runUse(0)
        return wrapIfAsyncIterable(output, map)
      } catch (error) {
        return await finalizeDeclaredError(error, map)
      }
    },
  )
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  )
}

function wrapIfAsyncIterable(value: unknown, map: ErrorMap): unknown {
  if (!isAsyncIterable(value)) {
    return value
  }
  return wrapAsyncIterable(value, map)
}

function wrapAsyncIterable(
  value: AsyncIterable<unknown>,
  map: ErrorMap,
): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      const it = value[Symbol.asyncIterator]()
      return {
        async next() {
          try {
            return await it.next()
          } catch (error) {
            return await finalizeDeclaredError(error, map)
          }
        },
        async return() {
          return it.return
            ? it.return()
            : { done: true as const, value: undefined }
        },
      }
    },
  }
}

export function lookupProcedure(
  router: ImplementedRouter,
  path: string[],
): ImplementedProcedure | undefined {
  let current: ImplementedProcedure | ImplementedRouter | undefined = router
  for (const segment of path) {
    if (!current || isImplementedProcedure(current)) {
      return undefined
    }
    current = current[segment]
  }
  return current && isImplementedProcedure(current) ? current : undefined
}

export function assertContractProcedure(
  value: unknown,
): asserts value is ContractProcedure {
  if (!isContractProcedure(value)) {
    throw new Error('Expected a contract procedure')
  }
}
