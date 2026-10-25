import { walkContract } from '@ts-pf/docs'
import type { ExcludedPath } from './all.js'
import type { ProcPaths } from './infer.js'
import { nodeInfo } from './node.js'
import { isTool, procedureSpec, toolSpec } from './tool.js'
import { isHidden } from './tool-meta.js'
import { type AnyToolset, type Toolset, toolsetSpec } from './toolset.js'

type Uncovered<T, S, X> = Exclude<
  ProcPaths<T>,
  | (S extends readonly Toolset<unknown, never, infer P>[] ? P : never)
  | ExcludedPath<X>
>

export type CoverageCheck<T, S, X> = [Uncovered<T, S, X>] extends [never]
  ? unknown
  : {
      uncovered: `"${Uncovered<T, S, X>}" is not exposed by any toolset nor excluded`
    }

/** Paths no toolset exposes (flat or through a host) and no exclusion names. `docs({ hidden: true })` counts as decided. */
export function uncoveredPaths(
  contract: unknown,
  toolsets: readonly AnyToolset[],
  exclude: readonly unknown[],
): string[] {
  const covered = new Set<string>()
  for (const toolset of toolsets) {
    const spec = toolsetSpec(toolset)
    for (const tool of Object.values(spec.tools)) covered.add(tool.path)
    for (const host of Object.values(spec.hosts)) {
      for (const tool of Object.values(host.tools)) covered.add(tool.path)
    }
  }
  const prefixes: string[] = []
  for (const value of exclude) {
    if (isTool(value)) covered.add(toolSpec(value).path)
    else {
      const info = nodeInfo(value)
      if (!info) throw new TypeError('$coverage() exclude takes tools or nodes')
      prefixes.push(info.path.join('.'))
    }
  }
  return walkContract(contract)
    .filter((entry) => !isHidden(procedureSpec('', entry.procedure)))
    .map((entry) => entry.path.join('.'))
    .filter(
      (path) =>
        !covered.has(path) &&
        !prefixes.some(
          (p) => p === '' || path === p || path.startsWith(`${p}.`),
        ),
    )
}
