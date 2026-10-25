// Spike round 2: final design ($-prefixed root, .effect, hosts, typed all() inject, createMcpFactory).
import type {
  AnySchema,
  ContractClient,
  ErrorDef,
  ErrorMap,
  InferContractProcedure,
  InferErrorData,
  InferSchemaInput,
  InferSchemaOutput,
  IsContractProcedure,
} from '@ts-pf/contract'
import type { CallInterceptor, ImplementedRouter } from '@ts-pf/server'

export type CallInfo = { authInfo?: unknown; signal?: AbortSignal }
export type Effect = 'read' | 'write' | 'destructive'
type MaybePromise<T> = T | Promise<T>
type Keys<T> = Exclude<keyof T & string, '~pf'>
type KeysOfUnion<T> = T extends unknown ? keyof T : never
type FieldOf<T, K extends PropertyKey> = T extends unknown ? (K extends keyof T ? T[K] : never) : never
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type ToolName<P extends string> = P extends `${infer A}.${infer B}` ? `${A}_${ToolName<B>}` : P

type In<P> = InferContractProcedure<P>['input']
type Out<P> = InferContractProcedure<P>['output']
type Meta<P> = InferContractProcedure<P>['meta']
type Err<P> = InferContractProcedure<P>['errors'] extends infer E extends ErrorMap ? E : {}

type Mode = 'none' | 'inject' | 'input'
type St = { model: unknown; mode: Mode }

declare const nodeBrand: unique symbol

export type ToolPhantom<Path extends string, Ctx, Model> = { path: Path; ctx: (context: Ctx) => void; model: Model }
export type MapperOpts<T, Ctx> = { context: Ctx; info: CallInfo; call: ContractClient<T> }

export interface ToolBuilder<T, P, Ctx, Path extends string, S extends St> {
  readonly '~tool': ToolPhantom<Path, Ctx, S['model']>
  describe(text: string): ToolBuilder<T, P, Ctx, Path, S>
  /** Unclassified tools are treated as 'write'. */
  effect(effect: Effect): ToolBuilder<T, P, Ctx, Path, S>
  inject: S['mode'] extends 'input'
    ? (error: '.inject() cannot be combined with .input(); inject inside the input map', ...rest: unknown[]) => never
    : [S['model']] extends [object]
      ? <K extends KeysOfUnion<S['model']>>(map: {
          [Q in K]: (o: { context: Ctx; info: CallInfo }) => MaybePromise<FieldOf<S['model'], Q>>
        }) => ToolBuilder<T, P, Ctx, Path, { model: DistOmit<S['model'], K>; mode: 'inject' }>
      : (error: '.inject() needs an object input') => never
  input: S['mode'] extends 'none'
    ? <Sch extends AnySchema, A = InferSchemaOutput<Sch>>(
        schema: Sch,
        map: (args: A, o: MapperOpts<T, Ctx>) => MaybePromise<In<P>>,
      ) => ToolBuilder<T, P, Ctx, Path, { model: InferSchemaInput<Sch>; mode: 'input' }>
    : (error: '.input() cannot be combined with .inject(); inject inside the input map', ...rest: unknown[]) => never
  output<R>(map: (out: Out<P>, o: MapperOpts<T, Ctx>) => MaybePromise<R>): ToolBuilder<T, P, Ctx, Path, S>
  output<Sch extends AnySchema, R extends InferSchemaInput<Sch>>(
    schema: Sch,
    map: (out: Out<P>, o: MapperOpts<T, Ctx>) => MaybePromise<R>,
  ): ToolBuilder<T, P, Ctx, Path, S>
  errors(map: {
    [K in keyof Err<P> & string]?: (o: {
      data: Err<P>[K] extends infer D extends ErrorDef ? InferErrorData<D> : never
      message: string
      context: Ctx
    }) => string
  }): ToolBuilder<T, P, Ctx, Path, S>
  examples(list: readonly S['model'][]): ToolBuilder<T, P, Ctx, Path, S>
}

export type ToolkitNode<T, Sub, Ctx, Prefix extends string> = {
  readonly [nodeBrand]?: { prefix: Prefix; ctx: (c: Ctx) => void }
} & {
  [K in Keys<Sub>]: IsContractProcedure<Sub[K]> extends true
    ? ToolBuilder<T, Sub[K], Ctx, `${Prefix}${K}`, { model: In<Sub[K]>; mode: 'none' }>
    : ToolkitNode<T, Sub[K], Ctx, `${Prefix}${K}.`>
}

export type AnyTool<Ctx = any> = { readonly '~tool': ToolPhantom<string, Ctx, unknown> }
type AnyNode = { readonly [nodeBrand]?: { prefix: string; ctx: any } }
type ToolRecord<Ctx = any> = { readonly [name: string]: AnyTool<Ctx> }
type NodeCtx<N> = N extends { readonly [nodeBrand]?: { ctx: (c: infer C) => void } } ? C : never

// ---- all() ---------------------------------------------------------------------
type LeafTools<N> = {
  [K in Exclude<keyof N, typeof nodeBrand>]: N[K] extends AnyTool ? N[K] : LeafTools<N[K]>
}[Exclude<keyof N, typeof nodeBrand>]

type ExcludedPath<X> = X extends AnyTool
  ? X['~tool']['path']
  : X extends { readonly [nodeBrand]?: { prefix: infer P extends string } }
    ? `${P}${string}`
    : never

/** Effect from typed meta `{ mcp: { effect } }`; unclassified counts as 'write'. */
type ToolEffect<Tl> = Tl extends ToolBuilder<any, infer P, any, any, any>
  ? Meta<P> extends { mcp: { effect: infer E extends Effect } }
    ? E
    : 'write'
  : 'write'

type Injected<Tl, IK extends PropertyKey> = [IK] extends [never]
  ? Tl
  : Tl extends ToolBuilder<infer T, infer P, infer C, infer Path, infer S>
    ? [IK & KeysOfUnion<S['model']>] extends [never]
      ? Tl
      : ToolBuilder<T, P, C, Path, { model: DistOmit<S['model'], IK>; mode: 'inject' }>
    : Tl

export type AllTools<N, X, E, IK extends PropertyKey> = {
  [Tl in LeafTools<N> as Tl extends AnyTool
    ? Tl['~tool']['path'] extends ExcludedPath<X>
      ? never
      : ToolEffect<Tl> extends E
        ? ToolName<Tl['~tool']['path']>
        : never
    : never]: Injected<Tl, IK>
}

type ModelOf<Tl> = Tl extends AnyTool ? Tl['~tool']['model'] : never
type InjectFn<Ctx> = (o: { context: Ctx; info: CallInfo }) => unknown
/** Concrete (N is fixed before inject is checked), so it contextually types `context`; `Inj` alone cannot. */
type InjectCtx<N> = { [k: string]: InjectFn<NodeCtx<N>> }
/** Per key: not an input field anywhere → message; value not assignable to some field → message naming it. */
type Selected<N, X, E> = LeafTools<N> extends infer Tl
  ? Tl extends AnyTool
    ? Tl['~tool']['path'] extends ExcludedPath<X>
      ? never
      : ToolEffect<Tl> extends E
        ? Tl
        : never
    : never
  : never
type AllInjectCheck<Tls, Inj> = {
  [K in keyof Inj]: K extends KeysOfUnion<ModelOf<Tls>>
    ? ConflictPaths<Tls, K, Inj[K] extends (...a: any) => infer R ? Awaited<R> : never> extends infer C extends string
      ? [C] extends [never]
        ? unknown
        : `Injected "${K & string}" does not fit field ${C}`
      : unknown
    : `"${K & string}" is not an input field of any selected procedure`
}
type ConflictPaths<Tl, K extends PropertyKey, V> = Tl extends AnyTool
  ? K extends KeysOfUnion<Tl['~tool']['model']>
    ? [V] extends [FieldOf<Tl['~tool']['model'], K>]
      ? never
      : `${Tl['~tool']['path']}.${K & string}`
    : never
  : never

export function all<
  N extends AnyNode,
  const X extends readonly (AnyTool | AnyNode)[] = [],
  const E extends Effect = Effect,
  Inj extends object = {},
>(
  node: N,
  opts?: { exclude?: X; effect?: E | readonly E[]; tags?: string[]; inject?: Inj & InjectCtx<N> & AllInjectCheck<Selected<N, X[number], E>, Inj> },
): AllTools<N, X[number], E, keyof Inj> {
  return (node as any)['~all'](opts) as never
}

// ---- names, hosts, toolset -----------------------------------------------------
type Dups<L> = L extends readonly [infer H, ...infer R] ? (keyof H & KeysOfUnion<R[number]>) | Dups<R> : never
type Records<Tools> = Tools extends readonly unknown[] ? Tools : [Tools]
type RecordsOf<Tools> = Tools extends readonly unknown[] ? Tools[number] : Tools
type NamesOf<Tools> = KeysOfUnion<RecordsOf<Tools>> & string
type PathsOf<Tools> = RecordsOf<Tools> extends infer R
  ? R extends unknown
    ? R[keyof R] extends infer V
      ? V extends { readonly '~tool': { path: infer P } }
        ? P
        : never
      : never
    : never
  : never

/** Marks each offending key in each record with a message literal (the RouterImplCheck trick). */
type NameCheck<Tools, Taken extends string> = Tools extends readonly unknown[]
  ? { [I in keyof Tools]: { [K in keyof Tools[I] & (Dups<Tools> | Taken)]: NameMsg<K, Taken> } }
  : { [K in keyof Tools & Taken]: NameMsg<K, Taken> }
type NameMsg<K, Taken> = K extends Taken
  ? `Tool name "${K & string}" collides with a generated host tool name`
  : `Duplicate tool name "${K & string}"`

type Split = 'effect' | false
export type HostToolNames<K extends string, Sp> = Sp extends 'effect'
  ? `get_${K}_query_capabilities` | `call_${K}_query_capability` | `get_${K}_operations_capabilities` | `call_${K}_operations_capability`
  : `get_${K}_capabilities` | `call_${K}_capability`

export interface Host<Ctx, Paths extends string, Sp extends Split> {
  readonly '~host': { ctx: (c: Ctx) => void; paths: Paths; split: Sp }
}
type HostsNames<H> = { [K in keyof H & string]: H[K] extends Host<any, any, infer Sp> ? HostToolNames<K, Sp> : never }[keyof H & string]
type HostsPaths<H> = { [K in keyof H]: H[K] extends Host<any, infer P, any> ? P : never }[keyof H]
type HostsCheck<H> = {
  [K in keyof H & string]: H[K] extends Host<any, any, infer Sp>
    ? [HostToolNames<K, Sp> & HostsNames<Omit<H, K>>] extends [never]
      ? unknown
      : { '~error': `Host "${K}" generates "${HostToolNames<K, Sp> & HostsNames<Omit<H, K>>}", which another host also generates` }
    : unknown
}

export interface Toolset<T, Ctx, Paths extends string> {
  readonly '~toolset': { contract: T; ctx: (c: Ctx) => void; paths: Paths }
}

// ---- $-key guard -------------------------------------------------------------------
type DollarPaths<T, P extends string = ''> = {
  [K in Keys<T>]: K extends `$${string}`
    ? `${P}${K}`
    : IsContractProcedure<T[K]> extends true
      ? never
      : DollarPaths<T[K], `${P}${K}.`>
}[Keys<T>]
type DollarGuard<T> = [DollarPaths<T>] extends [never]
  ? unknown
  : { '~error': `Contract key "${DollarPaths<T>}" starts with "$", which createToolkit reserves for $context/$toolset/$host/$tool/$coverage. Rename it.` }

// ---- coverage ---------------------------------------------------------------------
export type ProcPaths<T, P extends string = ''> = {
  [K in Keys<T>]: IsContractProcedure<T[K]> extends true ? `${P}${K}` : ProcPaths<T[K], `${P}${K}.`>
}[Keys<T>]
type Uncovered<T, S, X> = Exclude<
  ProcPaths<T>,
  (S extends readonly Toolset<any, any, infer P>[] ? P : never) | ExcludedPath<X>
>
type CoverageCheck<T, S, X> = [Uncovered<T, S, X>] extends [never]
  ? unknown
  : { uncovered: `"${Uncovered<T, S, X>}" is not exposed by any toolset nor excluded` }

// ---- toolkit root -------------------------------------------------------------------
export type Toolkit<T, Ctx> = ToolkitNode<T, T, Ctx, ''> & {
  $context<C>(): Toolkit<T, C>
  $host<const Tools extends ToolRecord<Ctx> | readonly ToolRecord<Ctx>[], const Sp extends Split = false>(def: {
    description: string
    tools: Tools & NameCheck<Tools, never>
    split?: Sp
  }): Host<Ctx, PathsOf<Tools>, NoInfer<Sp>>
  $toolset<
    const Tools extends ToolRecord<Ctx> | readonly ToolRecord<Ctx>[] = {},
    const H extends { [key: string]: Host<Ctx, string, Split> } = {},
  >(def: {
    tools?: Tools & NameCheck<Tools, HostsNames<H>>
    hosts?: H & HostsCheck<H>
  }): Toolset<T, Ctx, PathsOf<Tools> | HostsPaths<H>>
  $tool<Sch extends AnySchema>(def: {
    description: string
    effect: Effect
    input: Sch
    run: (o: MapperOpts<T, Ctx> & { input: InferSchemaOutput<Sch> }) => unknown
  }): { readonly '~tool': ToolPhantom<never, Ctx, InferSchemaInput<Sch>> }
  $coverage<const S extends readonly Toolset<T, any, string>[], const X extends readonly (AnyTool | AnyNode)[] = []>(
    opts: { toolsets: S; exclude?: X } & CoverageCheck<T, S, X[number]>,
  ): void
}

// ---- runtime-facing types ----------------------------------------------------------
export type McpTools = {
  list(info: CallInfo): Promise<unknown[]>
  call(name: string, args: unknown, info: CallInfo): Promise<unknown>
}
export function bindTools<T, Ctx>(
  toolset: Toolset<T, Ctx, string>,
  exec: { app: ImplementedRouter<NoInfer<T>, NoInfer<Ctx>>; context: (info: CallInfo) => MaybePromise<NoInfer<Ctx>> },
): McpTools
export function bindTools<T, Ctx>(toolset: Toolset<T, Ctx, string>, exec: { client: ContractClient<NoInfer<T>> }): McpTools
export function bindTools(_t: unknown, _e: unknown): McpTools {
  return { list: async () => [], call: async () => undefined }
}

type ServerOptions = {
  name: string
  version: string
  instructions?: string
  onError?: (error: unknown, info: CallInfo) => void
  maxResultChars?: number
}
/** `context` is required when the router carries a $context brand; optional (typed unknown) for an unbranded tree. */
type ContextOption<Ctx> = unknown extends Ctx
  ? { context?: (info: CallInfo) => unknown }
  : { context: (info: CallInfo) => MaybePromise<Ctx> }
export type McpFactory = { readonly '~mcpFactory': true }

export function createMcpFactory(source: McpTools, options: ServerOptions): McpFactory
export function createMcpFactory<T, Ctx>(
  source: ImplementedRouter<T, Ctx>,
  options: ServerOptions & { interceptors?: readonly CallInterceptor[] } & ContextOption<NoInfer<Ctx>>,
): McpFactory
export function createMcpFactory(_s: unknown, _o: unknown): McpFactory {
  return { '~mcpFactory': true }
}

/** Typed meta helper so `effect` stays a literal in `.meta(mcp({ effect: 'read' }))`. */
export function mcp<const E extends Effect>(m: { effect: E }): { mcp: { effect: E } } {
  return { mcp: m }
}

// ---- skeletal runtime -------------------------------------------------------------
function makeBuilder(path: string[], cfg: Record<string, unknown> = {}): unknown {
  const next = (k: string) => (...a: unknown[]) => makeBuilder(path, { ...cfg, [k]: a })
  const b: Record<string, unknown> = { '~tool': { path: path.join('.') } }
  for (const k of ['describe', 'effect', 'inject', 'input', 'output', 'errors', 'examples']) b[k] = next(k)
  return b
}
function makeNode(contract: unknown, path: string[]): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_t, key) {
      if (typeof key !== 'string') return undefined
      if (key === '~all') return () => ({})
      const child = (contract as Record<string, unknown>)[key]
      if (child && typeof child === 'object' && (child as any)['~pf']?.type === 'procedure') return makeBuilder([...path, key])
      return makeNode(child, [...path, key])
    },
  })
}
export function createToolkit<T>(contract: T & DollarGuard<T>): Toolkit<T, object> {
  const root = makeNode(contract, []) as Record<string, unknown>
  const members: Record<string, unknown> = {
    $context: () => createToolkit(contract),
    $toolset: (def: unknown) => ({ '~toolset': def }),
    $host: (def: unknown) => ({ '~host': def }),
    $tool: (def: unknown) => ({ '~tool': def }),
    $coverage: () => undefined,
  }
  return new Proxy(root, { get: (t, k) => (typeof k === 'string' && k in members ? members[k] : t[k as string]) }) as never
}
