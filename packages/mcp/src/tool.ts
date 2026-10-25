import type {
  AnySchema,
  ContractClient,
  ContractProcedure,
  ErrorDef,
  InferErrorData,
  InferSchemaInput,
  InferSchemaOutput,
} from '@ts-pf/contract'
import type {
  DistOmit,
  Err,
  FieldOf,
  In,
  KeysOfUnion,
  MaybePromise,
  Out,
} from './infer.js'
import type { Effect } from './meta.js'
import type { McpCallInfo } from './types.js'

/** Type-only view of the required `'~tool'` brand. At runtime the key holds a `ToolSpec`. */
export type ToolPhantom<Path extends string, Ctx, Model> = {
  path: Path
  ctx: (context: Ctx) => void
  model: Model
}

/** `never` context: a tool built for any context is assignable. */
export type AnyTool<Ctx = never> = {
  readonly '~tool': ToolPhantom<string, Ctx, unknown>
}

export type MapperOpts<T, Ctx> = {
  context: Ctx
  info: McpCallInfo
  /** A typed client on the same executor, for joins across procedures. */
  call: ContractClient<T>
}

// Runtime shapes of user callbacks; the typed builder signatures are checked at the call site.
export type InjectFn = (o: { context: unknown; info: McpCallInfo }) => unknown
type RuntimeOpts = MapperOpts<unknown, unknown>
type Mapper = (value: unknown, o: RuntimeOpts) => unknown
export type ErrorText = (o: {
  data: unknown
  message: string
  context: unknown
}) => string

/** Runtime description of one tool; what `'~tool'` holds. */
export interface ToolSpec {
  /** Procedure path (`user.find`); `''` for a `$tool` composite. */
  readonly path: string
  readonly procedure?: ContractProcedure
  readonly description?: string
  readonly effect?: Effect
  readonly inject: Readonly<Record<string, InjectFn>>
  /** `.input(schema, map)`, or a composite's input schema (no `map`). */
  readonly input?: { schema: AnySchema; map?: Mapper }
  readonly output?: { schema?: AnySchema; map: Mapper }
  readonly errors: Readonly<Record<string, ErrorText>>
  readonly examples: readonly unknown[]
  /** `$tool` composites run this instead of a procedure. */
  readonly run?: (o: RuntimeOpts & { input: unknown }) => unknown
}

export function toolSpec(tool: AnyTool): ToolSpec {
  return tool['~tool'] as unknown as ToolSpec
}

export function isTool(value: unknown): value is AnyTool {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)['~tool'] === 'object'
  )
}

type Mode = 'none' | 'inject' | 'input'
export type BuilderState = { model: unknown; mode: Mode }

export interface ToolBuilder<
  T,
  P,
  Ctx,
  Path extends string,
  S extends BuilderState,
> {
  readonly '~tool': ToolPhantom<Path, Ctx, S['model']>
  describe(text: string): ToolBuilder<T, P, Ctx, Path, S>
  /** Overrides `mcp({ effect })`. Unclassified tools are treated as `write`. */
  effect(effect: Effect): ToolBuilder<T, P, Ctx, Path, S>
  /** Hide input keys from the model and fill them per call (tenant ids, forced safe defaults). */
  inject: S['mode'] extends 'input'
    ? (
        error: '.inject() cannot be combined with .input(); inject inside the input map',
        ...rest: unknown[]
      ) => never
    : [S['model']] extends [object]
      ? <K extends KeysOfUnion<S['model']>>(
          map: {
            [Q in K]: (o: {
              context: Ctx
              info: McpCallInfo
            }) => MaybePromise<FieldOf<S['model'], Q>>
          },
        ) => ToolBuilder<
          T,
          P,
          Ctx,
          Path,
          { model: DistOmit<S['model'], K>; mode: 'inject' }
        >
      : (error: '.inject() needs an object input') => never
  /** A new model-facing input; `map` must return the procedure input. */
  input: S['mode'] extends 'none'
    ? <Sch extends AnySchema, A = InferSchemaOutput<Sch>>(
        schema: Sch,
        map: (args: A, o: MapperOpts<T, Ctx>) => MaybePromise<In<P>>,
      ) => ToolBuilder<
        T,
        P,
        Ctx,
        Path,
        { model: InferSchemaInput<Sch>; mode: 'input' }
      >
    : (
        error: '.input() cannot be combined with .inject(); inject inside the input map',
        ...rest: unknown[]
      ) => never
  /** Reshape the result. No `outputSchema` is advertised without a schema. */
  output<R>(
    map: (out: Out<P>, o: MapperOpts<T, Ctx>) => MaybePromise<R>,
  ): ToolBuilder<T, P, Ctx, Path, S>
  /** Reshape the result and advertise `schema` as `outputSchema`; results are checked against it. */
  output<Sch extends AnySchema, R extends InferSchemaInput<Sch>>(
    schema: Sch,
    map: (out: Out<P>, o: MapperOpts<T, Ctx>) => MaybePromise<R>,
  ): ToolBuilder<T, P, Ctx, Path, S>
  /** Rewrite declared errors into a next step for the model. */
  errors(
    map: {
      [K in keyof Err<P> & string]?: (o: {
        data: Err<P>[K] extends infer D extends ErrorDef
          ? InferErrorData<D>
          : never
        message: string
        context: Ctx
      }) => string
    },
  ): ToolBuilder<T, P, Ctx, Path, S>
  /** Appended to the description; returned by hosts at `detail: 'full'`. */
  examples(list: readonly S['model'][]): ToolBuilder<T, P, Ctx, Path, S>
}

/** Immutable builder: each method returns a new builder over a copied spec. */
export function createToolBuilder(spec: ToolSpec): unknown {
  const next = (patch: Partial<ToolSpec>) =>
    createToolBuilder({ ...spec, ...patch })
  return {
    '~tool': spec,
    describe: (description: string) => next({ description }),
    effect: (effect: Effect) => next({ effect }),
    inject: (map: Record<string, InjectFn>) =>
      next({ inject: { ...spec.inject, ...map } }),
    input: (schema: AnySchema, map: Mapper) => next({ input: { schema, map } }),
    output: (schemaOrMap: AnySchema | Mapper, map?: Mapper) =>
      next({
        output: map
          ? { schema: schemaOrMap as AnySchema, map }
          : { map: schemaOrMap as Mapper },
      }),
    errors: (errors: Record<string, ErrorText>) =>
      next({ errors: { ...spec.errors, ...errors } }),
    examples: (examples: readonly unknown[]) => next({ examples }),
  }
}

export function procedureSpec(
  path: string,
  procedure: ContractProcedure,
): ToolSpec {
  return { path, procedure, inject: {}, errors: {}, examples: [] }
}
