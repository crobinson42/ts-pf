import type { ErrorMap } from './errors.js'
import type {
  ExpandCheck,
  ExpandFields,
  ExpandSpec,
  Expansion,
} from './expand.js'
import {
  type ContractProcedure,
  type ContractProcedureDef,
  isContractProcedure,
} from './procedure.js'
import { assertContractRouter, type ContractRouterBrand } from './router.js'
import type {
  AnySchema,
  InferSchemaInput,
  InferSchemaOutput,
} from './schema.js'

export class ContractBuilder<
  TInput = void,
  TOutput = unknown,
  TErrors extends ErrorMap = {},
  TMeta extends Record<string, unknown> = {},
  TParsedInput = TInput,
  TExpand = never,
> implements
    ContractProcedure<TInput, TOutput, TErrors, TMeta, TParsedInput, TExpand>
{
  readonly '~pf': ContractProcedureDef<TErrors, TMeta>
  // Phantom, like on `ContractProcedure`; `declare` emits nothing. It makes a
  // builder structurally a `ContractProcedure<I, O, E, M, P>`, so one
  // `InferContractProcedure` branch reads both, and two builders with
  // different input / output are no longer mutually assignable.
  declare readonly '~types'?: {
    input: TInput
    parsedInput: TParsedInput
    output: TOutput
    expand: TExpand
  }

  constructor(def?: Partial<ContractProcedureDef<TErrors, TMeta>>) {
    this['~pf'] = {
      type: 'procedure',
      errors: (def?.errors ?? {}) as TErrors,
      meta: (def?.meta ?? {}) as TMeta,
      ...(def?.input !== undefined ? { input: def.input } : {}),
      ...(def?.output !== undefined ? { output: def.output } : {}),
      ...(def?.expand !== undefined ? { expand: def.expand } : {}),
    }
  }

  /**
   * Callers send the schema's input type (a `.default()` field is optional);
   * the handler gets its output type (the parsed value).
   */
  input<S>(
    schema: S,
  ): ContractBuilder<
    InferSchemaInput<S>,
    TOutput,
    TErrors,
    TMeta,
    InferSchemaOutput<S>
  > {
    if (this['~pf'].input !== undefined) {
      throw new Error('input already set')
    }
    return new ContractBuilder({
      ...this['~pf'],
      input: schema as AnySchema,
    }) as ContractBuilder<
      InferSchemaInput<S>,
      TOutput,
      TErrors,
      TMeta,
      InferSchemaOutput<S>
    >
  }

  output<S>(
    schema: S,
  ): ContractBuilder<
    TInput,
    InferSchemaOutput<S>,
    TErrors,
    TMeta,
    TParsedInput
  > {
    if (this['~pf'].output !== undefined) {
      throw new Error('output already set')
    }
    return new ContractBuilder({
      ...this['~pf'],
      output: schema as AnySchema,
    }) as ContractBuilder<
      TInput,
      InferSchemaOutput<S>,
      TErrors,
      TMeta,
      TParsedInput
    >
  }

  errors<E extends ErrorMap>(
    map: E,
  ): ContractBuilder<TInput, TOutput, E, TMeta, TParsedInput, TExpand> {
    return new ContractBuilder({
      ...this['~pf'],
      errors: map,
    }) as unknown as ContractBuilder<
      TInput,
      TOutput,
      E,
      TMeta,
      TParsedInput,
      TExpand
    >
  }

  meta<M extends Record<string, unknown>>(
    meta: M,
  ): ContractBuilder<
    TInput,
    TOutput,
    TErrors,
    TMeta & M,
    TParsedInput,
    TExpand
  > {
    return new ContractBuilder({
      ...this['~pf'],
      meta: { ...this['~pf'].meta, ...meta },
    }) as ContractBuilder<
      TInput,
      TOutput,
      TErrors,
      TMeta & M,
      TParsedInput,
      TExpand
    >
  }

  $meta<M extends Record<string, unknown>>(): ContractBuilder<
    TInput,
    TOutput,
    TErrors,
    M,
    TParsedInput,
    TExpand
  > {
    return new ContractBuilder<
      TInput,
      TOutput,
      TErrors,
      M,
      TParsedInput,
      TExpand
    >({
      ...this['~pf'],
      meta: {} as M,
    })
  }

  /**
   * The output follows a list in the input: callers that pass
   * `{ [key]: ['authorId'] }` get `authorId` as its expanded type, others its
   * plain type. `.output()` is the wide schema (what the server may send);
   * `fields` are the expanded schemas, so the plain type is the wide one
   * minus them. `at` is the key path to the expandable object (arrays pass
   * through); omit it for the root. Call after `.input()` and `.output()`,
   * once.
   */
  expand<
    const K extends string,
    F extends Record<string, unknown>,
    const A extends readonly string[] = readonly [],
  >(
    spec: ExpandSpec<K, A, F> &
      ExpandCheck<TInput, TOutput, K, A, ExpandFields<F>>,
  ): ContractBuilder<
    TInput,
    TOutput,
    TErrors,
    TMeta,
    TParsedInput,
    Expansion<K, A, ExpandFields<F>>
  > {
    const def = this['~pf']
    if (def.input === undefined || def.output === undefined) {
      throw new Error('expand needs .input() and .output() first')
    }
    if (def.expand !== undefined) {
      throw new Error('expand already set')
    }
    if (Object.keys(spec.fields).length === 0) {
      throw new Error('expand needs at least one field')
    }
    return new ContractBuilder({
      ...def,
      expand: {
        key: spec.key,
        at: [...(spec.at ?? [])],
        fields: { ...spec.fields } as Record<string, AnySchema>,
      },
    }) as unknown as ContractBuilder<
      TInput,
      TOutput,
      TErrors,
      TMeta,
      TParsedInput,
      Expansion<K, A, ExpandFields<F>>
    >
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
