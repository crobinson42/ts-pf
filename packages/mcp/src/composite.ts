import type {
  AnySchema,
  InferSchemaInput,
  InferSchemaOutput,
} from '@ts-pf/contract'
import { defined } from '@ts-pf/protocol'
import type { Effect } from './meta.js'
import { checkScopes } from './scopes.js'
import type { MapperOpts, ToolPhantom, ToolSpec, Visibility } from './tool.js'

export type CompositeToolDef<T, Ctx, Sch extends AnySchema> = {
  description: string
  effect: Effect
  input: Sch
  run: (o: MapperOpts<T, Ctx> & { input: InferSchemaOutput<Sch> }) => unknown
  /** Per-caller listing hint, as `.visible()`. */
  visible?: Visibility
  /** OAuth scopes the caller must hold, as `.scopes()`. */
  scopes?: readonly string[]
}

/** An N→1 tool: no procedure path, so `$coverage` never counts it. */
export type CompositeTool<Ctx, Model> = {
  readonly '~tool': ToolPhantom<never, Ctx, Model>
}

export function createCompositeTool<T, Ctx, Sch extends AnySchema>(
  def: CompositeToolDef<T, Ctx, Sch>,
): CompositeTool<Ctx, InferSchemaInput<Sch>> {
  const spec: ToolSpec = {
    ...defined({
      visible: def.visible,
      scopes: def.scopes && checkScopes(def.scopes, '$tool()'),
    }),
    path: '',
    description: def.description,
    effect: def.effect,
    inject: {},
    input: { schema: def.input },
    errors: {},
    examples: [],
    run: def.run as NonNullable<ToolSpec['run']>,
  }
  return { '~tool': spec } as never
}
