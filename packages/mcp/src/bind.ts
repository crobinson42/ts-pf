import type { ContractClient } from '@ts-pf/contract'
import type { CallInterceptor, ImplementedRouter } from '@ts-pf/server'
import { type BoundTool, bindTool } from './bound-tool.js'
import { type CallOptions, callTool } from './call.js'
import type { McpOnError } from './error-text.js'
import { appExecutor, clientExecutor } from './executor.js'
import { hostEntries, type ToolEntry, type ToolView } from './host.js'
import type { MaybePromise } from './infer.js'
import { DEFAULT_MAX_RESULT_CHARS, errorResult } from './result.js'
import { type Toolset, type ToolsetSpec, toolsetSpec } from './toolset.js'
import type { McpCallInfo, McpToolResult, McpTools } from './types.js'

/** Options that act inside `McpTools.call`, for both executors. */
export type CallPipelineOptions = {
  /** Replaces the default `console.error` of unknown / `INTERNAL` throws. */
  onError?: McpOnError
  /** Text results are cut here with a truncation note. Default 25,000. */
  maxResultChars?: number
}

export type AppBinding<T, Ctx> = CallPipelineOptions & {
  app: ImplementedRouter<T, Ctx>
  /** Runs once per call, with `info.tool` set. */
  context: (info: McpCallInfo) => MaybePromise<Ctx>
  /** Server `CallInterceptor`s, passed straight to `runProcedure`. */
  interceptors?: readonly CallInterceptor[]
}

/**
 * Mappers and `inject` still see `context`, so it is required when the
 * toolset's context type has required keys (`$context<AppCtx>()`), and `{}`
 * when omitted otherwise.
 */
type ClientContext<Ctx> = {} extends Ctx
  ? { context?: (info: McpCallInfo) => MaybePromise<Ctx> }
  : { context: (info: McpCallInfo) => MaybePromise<Ctx> }

export type ClientBinding<T, Ctx> = CallPipelineOptions & {
  /** A typed client, or one built per caller (a gateway calling upstream as the user). */
  client: ContractClient<T> | ((info: McpCallInfo) => ContractClient<T>)
} & ClientContext<Ctx>

/** A flat tool's entry: one fixed view, hidden per caller only by its own `visible`. */
function flatEntry(
  tool: BoundTool,
  invoke: (
    tool: BoundTool,
    args: unknown,
    info: McpCallInfo,
  ) => Promise<McpToolResult>,
): ToolEntry {
  const view: ToolView = {
    definition: tool.definition,
    invoke: (args, info) => invoke(tool, args, info),
  }
  const { visible, scopes = [] } = tool.spec
  return {
    name: tool.name,
    dynamic: visible !== undefined,
    resolve: async (info) =>
      !visible || (await visible(info)) ? view : undefined,
    scopes: async () => scopes,
  }
}

/** Bound tools from runtime specs; definitions, schemas, and search indexes are built once here. */
export function bindToolset(spec: ToolsetSpec, options: CallOptions): McpTools {
  const entries = new Map<string, ToolEntry>()
  const invoke = (tool: BoundTool, args: unknown, info: McpCallInfo) =>
    callTool(tool, args, info, options)
  for (const [name, toolSpec] of Object.entries(spec.tools)) {
    entries.set(name, flatEntry(bindTool(name, toolSpec), invoke))
  }
  for (const [key, host] of Object.entries(spec.hosts)) {
    const inner = Object.entries(host.tools).map(([name, s]) =>
      bindTool(name, s),
    )
    for (const entry of hostEntries(
      key,
      host,
      inner,
      invoke,
      options.maxResultChars,
    )) {
      entries.set(entry.name, entry)
    }
  }
  const all = [...entries.values()]
  // Nothing varies per caller: list the precomputed definitions.
  const fixed = all.some((entry) => entry.dynamic)
    ? undefined
    : Promise.all(all.map((entry) => entry.resolve({}))).then((views) =>
        views.flatMap((view) => (view ? [view.definition] : [])),
      )
  return {
    async list(info = {}) {
      if (fixed) return [...(await fixed)]
      const views = await Promise.all(all.map((entry) => entry.resolve(info)))
      return views.flatMap((view) => (view ? [view.definition] : []))
    },
    async call(name, args, info = {}) {
      const view = await entries.get(name)?.resolve(info)
      if (!view) {
        return errorResult(`Unknown tool "${name}"`, options.maxResultChars)
      }
      return view.invoke(args, info)
    },
    async scopesFor(name, args, info = {}) {
      const entry = entries.get(name)
      if (!entry || !(await entry.resolve(info))) return []
      return entry.scopes(args, info)
    },
  }
}

/** Bind a toolset to an executor. The contract and context are checked against the toolset's. */
export function bindTools<T, Ctx>(
  toolset: Toolset<T, Ctx, string>,
  binding: AppBinding<NoInfer<T>, NoInfer<Ctx>>,
): McpTools
export function bindTools<T, Ctx>(
  toolset: Toolset<T, Ctx, string>,
  binding: ClientBinding<NoInfer<T>, NoInfer<Ctx>>,
): McpTools
export function bindTools(
  toolset: Toolset<unknown, unknown, string>,
  binding: AppBinding<unknown, unknown> | ClientBinding<unknown, unknown>,
): McpTools {
  const executor =
    'app' in binding
      ? appExecutor(binding.app, binding.context, binding.interceptors)
      : clientExecutor(binding.client, binding.context)
  return bindToolset(toolsetSpec(toolset), {
    executor,
    onError: binding.onError,
    maxResultChars: binding.maxResultChars ?? DEFAULT_MAX_RESULT_CHARS,
  })
}
