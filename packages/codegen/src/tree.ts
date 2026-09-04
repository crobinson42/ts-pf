import type { CatalogProcedure } from '@ts-pf/docs'

export type ProcNode = { kind: 'proc'; proc: CatalogProcedure }
export type NsNode = { kind: 'ns'; children: Map<string, TreeNode> }
export type TreeNode = ProcNode | NsNode

export function buildTree(
  procedures: readonly CatalogProcedure[],
): Map<string, TreeNode> {
  const root = new Map<string, TreeNode>()
  for (const proc of procedures) {
    insert(root, proc)
  }
  return root
}

function insert(root: Map<string, TreeNode>, proc: CatalogProcedure): void {
  const path = proc.path
  if (path.length === 0) {
    throw new Error(
      'Empty procedure path. Wrap the contract in router({ ... }).',
    )
  }

  let current = root
  for (let i = 0; i < path.length; i++) {
    const key = path[i]
    if (key === undefined) {
      throw new Error(
        'Empty procedure path. Wrap the contract in router({ ... }).',
      )
    }
    const isLast = i === path.length - 1
    const existing = current.get(key)
    const here = path.slice(0, i + 1).join('/')

    if (isLast) {
      if (existing?.kind === 'ns') {
        throw new Error(
          `Path overlaps a namespace: ${here} vs ${[...existing.children.keys()].map((child) => `${here}/${child}`).join(', ')}`,
        )
      }
      if (existing?.kind === 'proc') {
        throw new Error(`Duplicate procedure path: ${here}`)
      }
      current.set(key, { kind: 'proc', proc })
      return
    }

    if (existing?.kind === 'proc') {
      throw new Error(`Path overlaps a procedure: ${here} vs ${path.join('/')}`)
    }
    if (existing === undefined) {
      const ns: NsNode = { kind: 'ns', children: new Map() }
      current.set(key, ns)
      current = ns.children
    } else {
      current = existing.children
    }
  }
}
