import type { AnySchema, InferSchemaInput } from '@ts-pf/contract'
import {
  type CompositeTool,
  type CompositeToolDef,
  createCompositeTool,
} from './composite.js'
import { type CoverageCheck, uncoveredPaths } from './coverage.js'
import type { DollarGuard, Split } from './names.js'
import { type AnyNode, createNode, type ToolkitNode } from './node.js'
import type { AnyTool, Visibility } from './tool.js'
import {
  type AnyToolset,
  createHost,
  createToolset,
  type Host,
  type HostsCheck,
  type HostsNames,
  type HostsPaths,
  type NameCheck,
  type PathsOf,
  type Toolset,
  type ToolsInput,
} from './toolset.js'

export type Toolkit<T, Ctx> = ToolkitNode<T, T, Ctx, ''> & {
  /** Type the context every mapper, inject, and binding sees. Same toolkit at runtime. */
  $context<C>(): Toolkit<T, C>
  /** Group tools behind `get_<key>[_<bucket>]_capabilities` / `call_<key>[_<bucket>]_capability`. */
  $host<
    const Tools extends ToolsInput<Ctx>,
    const Sp extends Split = 'effect',
  >(def: {
    /** What the model reads before searching. */
    description: string
    tools: Tools & NameCheck<Tools, never>
    /** `'effect'` (default): `query` (read) and `operations` (write + destructive). */
    split?: Sp
    /** Show the host only to callers for whom this is true; inner tools' `.visible()` filters what it offers. */
    visible?: Visibility
  }): Host<Ctx, PathsOf<Tools>, NoInfer<Sp>>
  /** One MCP server's tools: flat tools (the object key is the name) plus hosts. */
  $toolset<
    const Tools extends ToolsInput<Ctx> = {},
    const H extends { [key: string]: Host<Ctx, string, Split> } = {},
  >(def: {
    tools?: Tools & NameCheck<Tools, HostsNames<H>>
    hosts?: H & HostsCheck<H>
  }): Toolset<T, Ctx, PathsOf<Tools> | HostsPaths<H>>
  /** A composite N→1 tool over `call`. */
  $tool<Sch extends AnySchema>(
    def: CompositeToolDef<T, Ctx, Sch>,
  ): CompositeTool<Ctx, InferSchemaInput<Sch>>
  /** Compile error (and runtime throw) naming every procedure no toolset exposes and no `exclude` names. */
  $coverage<
    const S extends readonly Toolset<T, never, string>[],
    const X extends readonly (AnyTool | AnyNode)[] = [],
  >(
    options: { toolsets: S; exclude?: X } & CoverageCheck<T, S, X[number]>,
  ): void
}

/** Typed tool builders mirroring `contract`. Root members start with `$`, so no contract key can collide. */
export function createToolkit<T>(
  contract: T & DollarGuard<T>,
): Toolkit<T, object> {
  const members = {
    $context: () => toolkit,
    $host: createHost,
    $toolset: (def: Parameters<typeof createToolset>[1]) =>
      createToolset(contract, def),
    $tool: createCompositeTool,
    $coverage: (options: {
      toolsets: readonly AnyToolset[]
      exclude?: readonly unknown[]
    }) => {
      const missing = uncoveredPaths(
        contract,
        options.toolsets,
        options.exclude ?? [],
      )
      if (missing.length > 0) {
        throw new Error(
          `$coverage(): not exposed by any toolset nor excluded: ${missing.join(', ')}`,
        )
      }
    },
  }
  const toolkit = createNode(contract, [], members) as Toolkit<T, object>
  return toolkit
}
