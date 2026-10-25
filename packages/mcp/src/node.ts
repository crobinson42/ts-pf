import type { IsContractProcedure } from '@ts-pf/contract'
import { isContractProcedure } from '@ts-pf/contract'
import type { In, Keys } from './infer.js'
import { createToolBuilder, procedureSpec, type ToolBuilder } from './tool.js'

declare const nodeBrand: unique symbol
export type NodeBrand = typeof nodeBrand

/** A contract router node mirrored as tool builders; leaves are `ToolBuilder`s. */
export type ToolkitNode<T, Sub, Ctx, Prefix extends string> = {
  readonly [nodeBrand]?: { prefix: Prefix; ctx: (c: Ctx) => void }
} & {
  [K in Keys<Sub>]: IsContractProcedure<Sub[K]> extends true
    ? ToolBuilder<
        T,
        Sub[K],
        Ctx,
        `${Prefix}${K}`,
        { model: In<Sub[K]>; mode: 'none' }
      >
    : ToolkitNode<T, Sub[K], Ctx, `${Prefix}${K}.`>
}

export type AnyNode = {
  readonly [nodeBrand]?: { prefix: string; ctx: (c: never) => void }
}
export type NodeCtx<N> = N extends {
  readonly [nodeBrand]?: { ctx: (c: infer C) => void }
}
  ? C
  : never

const NODE_KEY = '~node'

export type NodeInfo = { contract: unknown; path: readonly string[] }

export function nodeInfo(value: unknown): NodeInfo | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  return (value as Record<string, NodeInfo | undefined>)[NODE_KEY]
}

/**
 * A lazy proxy over one contract router node. Children are created on first
 * access and memoized, so `tk.user.find` is the same builder every time.
 * `members` are extra root keys (`$context`, `$toolset`, …).
 */
export function createNode(
  contract: unknown,
  path: readonly string[],
  members: Readonly<Record<string, unknown>> = {},
): unknown {
  const info: NodeInfo = { contract, path }
  const children = new Map<string, unknown>()
  const child = (key: string): unknown => {
    if (children.has(key)) return children.get(key)
    const value = (contract as Record<string, unknown>)[key]
    const childPath = [...path, key]
    const created = isContractProcedure(value)
      ? createToolBuilder(procedureSpec(childPath.join('.'), value))
      : createNode(value, childPath)
    children.set(key, created)
    return created
  }
  return new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key !== 'string') return undefined
        if (key === NODE_KEY) return info
        if (Object.hasOwn(members, key)) return members[key]
        if (key.startsWith('~')) return undefined
        if (
          typeof contract !== 'object' ||
          contract === null ||
          !Object.hasOwn(contract, key)
        ) {
          return undefined
        }
        return child(key)
      },
    },
  )
}
