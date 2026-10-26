import { walkContract } from '@ts-pf/docs'
import { defined } from '@ts-pf/protocol'
import type {
  DeclaredKeysOfUnion,
  DistOmit,
  FieldOf,
  KeysOfUnion,
  Meta,
} from './infer.js'
import type { Effect } from './meta.js'
import { type ToolName, toolName } from './names.js'
import { type AnyNode, type NodeBrand, type NodeCtx, nodeInfo } from './node.js'
import { type InputKeys, procedureInputKeys } from './schema.js'
import { checkScopes } from './scopes.js'
import {
  type AnyTool,
  createToolBuilder,
  type InjectFn,
  isTool,
  procedureSpec,
  type ToolBuilder,
  type ToolSpec,
  toolSpec,
  type Visibility,
} from './tool.js'
import { effectOf, isHidden, tagsOf } from './tool-meta.js'
import type { McpCallInfo } from './types.js'

type LeafTools<N> = {
  [K in Exclude<keyof N, NodeBrand>]: N[K] extends AnyTool
    ? N[K]
    : LeafTools<N[K]>
}[Exclude<keyof N, NodeBrand>]

/** A tool excludes its own path; a node excludes everything under its prefix. */
export type ExcludedPath<X> = X extends AnyTool
  ? X['~tool']['path']
  : X extends { readonly [K in NodeBrand]?: { prefix: infer P extends string } }
    ? `${P}${string}`
    : never

/** Effect from typed meta `{ mcp: { effect } }`; unclassified counts as `write`. */
type ToolEffect<Tl> =
  Tl extends ToolBuilder<infer _T, infer P, infer _C, infer _Path, infer _S>
    ? Meta<P> extends { mcp: { effect: infer E extends Effect } }
      ? E
      : 'write'
    : 'write'

/** Typed `docs()` meta; `{}` when the procedure has none. */
type DocsOf<Tl> =
  Tl extends ToolBuilder<infer _T, infer P, infer _C, infer _Path, infer _S>
    ? Meta<P> extends { docs: infer D }
      ? D
      : string extends keyof Meta<P>
        ? { tags?: string[] } // index-signature meta: unknown, keep
        : {}
    : {}

/**
 * Mirrors the runtime filter where the types know: a literal `hidden: true` is
 * dropped; with a tags filter, literal tags must intersect it and no tags is
 * dropped. Widened `string[]` tags or a widened filter keep the tool.
 */
type Visible<Tl, Tg extends string> =
  DocsOf<Tl> extends infer D
    ? D extends { hidden: true }
      ? false
      : [Tg] extends [never]
        ? true
        : string extends Tg
          ? true
          : D extends { tags?: infer L extends readonly string[] }
            ? string extends L[number]
              ? true
              : [Extract<L[number], Tg>] extends [never]
                ? false
                : true
            : false
    : true

type Injected<Tl, IK extends PropertyKey> = [IK] extends [never]
  ? Tl
  : Tl extends ToolBuilder<infer T, infer P, infer C, infer Path, infer S>
    ? [IK & KeysOfUnion<S['model']>] extends [never]
      ? Tl
      : ToolBuilder<
          T,
          P,
          C,
          Path,
          { model: DistOmit<S['model'], IK>; mode: 'inject' }
        >
    : Tl

/**
 * Filters once into `Selected` (shared with the inject check), then maps. A
 * filtering `as` clause here would re-run over every leaf on each `keyof`,
 * which the toolset name checks take several times.
 */
export type AllTools<
  N,
  X,
  E,
  IK extends PropertyKey,
  Tg extends string = never,
> = {
  [Tl in Selected<N, X, E, Tg> as ToolName<Tl['~tool']['path']>]: Injected<
    Tl,
    IK
  >
}

type ModelOf<Tl> = Tl extends AnyTool ? Tl['~tool']['model'] : never
/** Concrete (`N` is fixed before `inject` is checked), so it contextually types `context`. */
type InjectCtx<N> = {
  [k: string]: (o: { context: NodeCtx<N>; info: McpCallInfo }) => unknown
}
type Selected<N, X, E, Tg extends string> =
  LeafTools<N> extends infer Tl
    ? Tl extends AnyTool
      ? Tl['~tool']['path'] extends ExcludedPath<X>
        ? never
        : ToolEffect<Tl> extends E
          ? Visible<Tl, Tg> extends true
            ? Tl
            : never
          : never
      : never
    : never
type ConflictPaths<Tl, K extends PropertyKey, V> = Tl extends AnyTool
  ? K extends KeysOfUnion<Tl['~tool']['model']>
    ? [V] extends [FieldOf<Tl['~tool']['model'], K>]
      ? never
      : `${Tl['~tool']['path']}.${K & string}`
    : never
  : never
/**
 * Per key: not a declared input field anywhere → message (a record input does
 * not count, so it cannot hide a typo); value does not fit some field → message
 * naming it.
 */
type AllInjectCheck<Tls, Inj> = {
  [K in keyof Inj]: K extends DeclaredKeysOfUnion<ModelOf<Tls>>
    ? ConflictPaths<
        Tls,
        K,
        Inj[K] extends (...a: never[]) => infer R ? Awaited<R> : never
      > extends infer C extends string
      ? [C] extends [never]
        ? unknown
        : `Injected "${K & string}" does not fit field ${C}`
      : unknown
    : `"${K & string}" is not an input field of any selected procedure`
}

export type AllOptions<
  N,
  X extends readonly unknown[],
  E,
  Inj,
  Tg extends string = never,
> = {
  exclude?: X
  effect?: E | readonly E[]
  /** `docs()` tags; a procedure matches when it has any of them. An empty list filters nothing. */
  tags?: readonly Tg[]
  /** Per-caller listing hint for every selected tool, as `.visible()`. */
  visible?: Visibility
  /** OAuth scopes every selected tool requires, as `.scopes()`. */
  scopes?: readonly string[]
  /**
   * Each key goes only to tools whose input has it (every key for a record
   * input), and must be a declared field of some selected input.
   */
  inject?: Inj &
    InjectCtx<N> &
    AllInjectCheck<Selected<N, X[number], E, Tg>, Inj>
}

type Exclusion = { path: string; subtree: boolean }

function exclusion(value: unknown): Exclusion {
  if (isTool(value)) return { path: toolSpec(value).path, subtree: false }
  const info = nodeInfo(value)
  if (info) return { path: info.path.join('.'), subtree: true }
  throw new TypeError('all() exclude takes toolkit tools or nodes')
}

function isExcluded(path: string, exclusions: readonly Exclusion[]): boolean {
  return exclusions.some(
    (x) =>
      path === x.path ||
      (x.subtree && (x.path === '' || path.startsWith(`${x.path}.`))),
  )
}

/**
 * The requested `inject` keys this tool's input has. Fails closed: an input
 * whose keys cannot be read throws rather than leaving a key to the model.
 */
function injectedKeys(
  spec: ToolSpec,
  input: InputKeys | undefined,
  requested: readonly string[],
): readonly string[] {
  if (requested.length === 0) return requested
  if (!input) {
    throw new Error(
      `all(): cannot read the input keys of "${spec.path}" to apply inject; exclude it and bind it with .input(schema, map) (or .inject())`,
    )
  }
  return input.open
    ? requested
    : requested.filter((key) => input.keys.includes(key))
}

/** The runtime twin of `AllInjectCheck`: a key no selected input declares is a typo. */
function checkDeclared(requested: readonly string[], declared: Set<string>) {
  const unknown = requested.find((key) => !declared.has(key))
  if (unknown !== undefined) {
    throw new Error(
      `all(): inject key "${unknown}" is not an input field of any selected procedure`,
    )
  }
}

/**
 * Default tools for every procedure under `node`, named by path. Filters by
 * `exclude` and `effect` (collecting declared `inject` keys), then skips
 * `docs({ hidden: true })` procedures, filters by `tags`, and applies
 * `inject`, `visible`, and `scopes` per tool.
 */
export function all<
  N extends AnyNode,
  const X extends readonly (AnyTool | AnyNode)[] = [],
  const E extends Effect = Effect,
  Inj extends object = {},
  const Tg extends string = never,
>(
  node: N,
  options?: AllOptions<N, X, E, Inj, Tg>,
): AllTools<N, X[number], E, keyof Inj, Tg> {
  const info = nodeInfo(node)
  if (!info) {
    throw new TypeError('all() takes a toolkit node, e.g. all(tk.user)')
  }
  const exclusions = (options?.exclude ?? []).map(exclusion)
  const effects =
    options?.effect === undefined ? undefined : [options.effect].flat()
  const tags: readonly string[] | undefined = options?.tags
  const shared = defined({
    visible: options?.visible,
    scopes: options?.scopes && checkScopes(options.scopes, 'all()'),
  })
  const inject = (options?.inject ?? {}) as Record<string, InjectFn>
  const requested = Object.keys(inject)
  // collected before the hidden / tags filters, which the types apply only
  // to literals, so this check is never stricter than `AllInjectCheck`
  const declared = new Set<string>()
  const tools: Record<string, unknown> = {}
  for (const entry of walkContract(info.contract)) {
    const path = [...info.path, ...entry.path].join('.')
    const spec = procedureSpec(path, entry.procedure)
    if (isExcluded(path, exclusions)) continue
    if (effects && !effects.includes(effectOf(spec) as E)) continue
    const input = requested.length > 0 ? procedureInputKeys(spec) : undefined
    for (const key of input?.keys ?? []) declared.add(key)
    if (isHidden(spec)) continue
    if (tags?.length && !tagsOf(spec).some((tag) => tags.includes(tag)))
      continue
    const keys = injectedKeys(spec, input, requested)
    const name = toolName(path)
    if (Object.hasOwn(tools, name)) {
      throw new Error(`all(): duplicate tool name "${name}"`)
    }
    tools[name] = createToolBuilder({
      ...spec,
      ...shared,
      inject: Object.fromEntries(
        keys.map((key) => [key, inject[key] as InjectFn]),
      ),
    })
  }
  checkDeclared(requested, declared)
  return tools as never
}
