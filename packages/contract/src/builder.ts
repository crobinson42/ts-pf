import type { ErrorMap } from './errors.js'
import {
  type ContractProcedure,
  type ContractProcedureDef,
  isContractProcedure,
} from './procedure.js'
import { assertContractRouter, type ContractRouterBrand } from './router.js'
import type { AnySchema, InferSchemaOutput } from './schema.js'

export class ContractBuilder<
  TInput = void,
  TOutput = unknown,
  TErrors extends ErrorMap = {},
  TMeta extends Record<string, unknown> = {},
> implements ContractProcedure<TInput, TOutput, TErrors, TMeta>
{
  readonly '~pf': ContractProcedureDef<TErrors, TMeta>

  constructor(def?: Partial<ContractProcedureDef<TErrors, TMeta>>) {
    this['~pf'] = {
      type: 'procedure',
      errors: (def?.errors ?? {}) as TErrors,
      meta: (def?.meta ?? {}) as TMeta,
      ...(def?.input !== undefined ? { input: def.input } : {}),
      ...(def?.output !== undefined ? { output: def.output } : {}),
    }
  }

  input<S>(
    schema: S,
  ): ContractBuilder<InferSchemaOutput<S>, TOutput, TErrors, TMeta> {
    if (this['~pf'].input !== undefined) {
      throw new Error('input already set')
    }
    return new ContractBuilder({
      ...this['~pf'],
      input: schema as AnySchema,
    }) as ContractBuilder<InferSchemaOutput<S>, TOutput, TErrors, TMeta>
  }

  output<S>(
    schema: S,
  ): ContractBuilder<TInput, InferSchemaOutput<S>, TErrors, TMeta> {
    if (this['~pf'].output !== undefined) {
      throw new Error('output already set')
    }
    return new ContractBuilder({
      ...this['~pf'],
      output: schema as AnySchema,
    }) as ContractBuilder<TInput, InferSchemaOutput<S>, TErrors, TMeta>
  }

  errors<E extends ErrorMap>(
    map: E,
  ): ContractBuilder<TInput, TOutput, E, TMeta> {
    return new ContractBuilder({
      ...this['~pf'],
      errors: map,
    }) as unknown as ContractBuilder<TInput, TOutput, E, TMeta>
  }

  meta<M extends Record<string, unknown>>(
    meta: M,
  ): ContractBuilder<TInput, TOutput, TErrors, TMeta & M> {
    return new ContractBuilder({
      ...this['~pf'],
      meta: { ...this['~pf'].meta, ...meta },
    }) as ContractBuilder<TInput, TOutput, TErrors, TMeta & M>
  }

  $meta<M extends Record<string, unknown>>(): ContractBuilder<
    TInput,
    TOutput,
    TErrors,
    M
  > {
    return new ContractBuilder({
      ...this['~pf'],
      meta: {} as M,
    })
  }

  router<T extends Record<string, unknown>>(def: T): T & ContractRouterBrand {
    assertContractRouter(def)
    Object.defineProperty(def, '~pf', {
      value: { type: 'router' },
      enumerable: false,
    })
    return def as T & ContractRouterBrand
  }
}

export const procedure = new ContractBuilder()

export function router<T extends Record<string, unknown>>(
  def: T,
): T & import('./router.js').ContractRouterBrand {
  return procedure.router(def)
}

export { isContractProcedure }
