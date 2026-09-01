import {
  type ContractProcedure,
  isContractProcedure,
  validateSchema,
} from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import { createErrorFactory } from './error-factory.js'
import type { MiddlewareFn } from './middleware.js'

export type HandlerFn = (opts: {
  input: unknown
  context: unknown
  errors: ReturnType<typeof createErrorFactory>
  path: string[]
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

export async function runProcedure(
  proc: ImplementedProcedure,
  rawInput: unknown,
  context: unknown,
): Promise<unknown> {
  const def = proc['~pf']
  const errors = createErrorFactory(def.contract['~pf'].errors)
  let ctx: Record<string, unknown> = { ...(context as Record<string, unknown>) }
  let input = rawInput

  const runUseAfter = async (index: number): Promise<unknown> => {
    const mw = def.useAfter[index]
    if (!mw) {
      const output = await def.handler({
        input,
        context: ctx,
        errors,
        path: def.path,
      })
      const outputSchema = def.contract['~pf'].output
      if (outputSchema) {
        const result = await validateSchema(outputSchema, output)
        if (!result.success) {
          throw new PFError({
            code: 'VALIDATION',
            status: 500,
            message: 'Output validation failed',
            data: { issues: result.issues },
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
            status: 422,
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

  return runUse(0)
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
