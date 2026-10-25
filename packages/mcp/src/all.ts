import { walkContract } from '@ts-pf/docs'
import type { DistOmit, FieldOf, KeysOfUnion, Meta } from './infer.js'
import type { Effect } from './meta.js'
import { type ToolName, toolName } from './names.js'
import { type AnyNode, type NodeBrand, type NodeCtx, nodeInfo } from './node.js'
import { procedureInputKeys } from './schema.js'
import {
  type AnyTool,
  createToolBuilder,
  type InjectFn,
  isTool,
  procedureSpec,
  type ToolBuilder,
  toolSpec,
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
export type AllTools<N, X, E, IK extends PropertyKey> = {
  [Tl in Selected<N, X, E> as ToolName<Tl['~tool']['path']>]: Injected<Tl, IK>
}

type ModelOf<Tl> = Tl extends AnyTool ? Tl['~tool']['model'] : never
/** Concrete (`N` is fixed before `inject` is checked), so it contextually types `context`. */
type InjectCtx<N> = {
  [k: string]: (o: { context: NodeCtx<N>; info: McpCallInfo }) => unknown
}
type Selected<N, X, E> =
  LeafTools<N> extends infer Tl
    ? Tl extends AnyTool
      ? Tl['~tool']['path'] extends ExcludedPath<X>
        ? never
        : ToolEffect<Tl> extends E
          ? Tl
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
/** Per key: not an input field anywhere → message; value does not fit some field → message naming it. */
type AllInjectCheck<Tls, Inj> = {
  [K in keyof Inj]: K extends KeysOfUnion<ModelOf<Tls>>
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

export type AllOptions<N, X extends readonly unknown[], E, Inj> = {
  exclude?: X
  effect?: E | readonly E[]
  /** `docs()` tags; a procedure matches when it has any of them. Filtered at runtime only. */
  tags?: readonly string[]
  /** Each key goes only to tools whose input has it. */
  inject?: Inj & InjectCtx<N> & AllInjectCheck<Selected<N, X[number], E>, Inj>
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
 * Default tools for every procedure under `node`, named by path. Skips
 * `docs({ hidden: true })` procedures, then filters by `exclude`, `effect`,
 * and `tags`, and applies `inject` per tool.
 */
export function all<
  N extends AnyNode,
  const X extends readonly (AnyTool | AnyNode)[] = [],
  const E extends Effect = Effect,
  Inj extends object = {},
>(
  node: N,
  options?: AllOptions<N, X, E, Inj>,
): AllTools<N, X[number], E, keyof Inj> {
  const info = nodeInfo(node)
  if (!info) {
    throw new TypeError('all() takes a toolkit node, e.g. all(tk.user)')
  }
  const exclusions = (options?.exclude ?? []).map(exclusion)
  const effects =
    options?.effect === undefined ? undefined : [options.effect].flat()
  const tags = options?.tags
  const inject = (options?.inject ?? {}) as Record<string, InjectFn>
  const tools: Record<string, unknown> = {}
  for (const entry of walkContract(info.contract)) {
    const path = [...info.path, ...entry.path].join('.')
    const spec = procedureSpec(path, entry.procedure)
    if (isHidden(spec) || isExcluded(path, exclusions)) continue
    if (effects && !effects.includes(effectOf(spec) as E)) continue
    if (tags && !tagsOf(spec).some((tag) => tags.includes(tag))) continue
    const keys = procedureInputKeys(spec).filter((key) =>
      Object.hasOwn(inject, key),
    )
    const name = toolName(path)
    if (Object.hasOwn(tools, name)) {
      throw new Error(`all(): duplicate tool name "${name}"`)
    }
    tools[name] = createToolBuilder({
      ...spec,
      inject: Object.fromEntries(
        keys.map((key) => [key, inject[key] as InjectFn]),
      ),
    })
  }
  return tools as never
}
