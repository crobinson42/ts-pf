import {
  McpServer,
  type McpServerFactory,
  type StandardSchemaWithJSON,
} from '@modelcontextprotocol/server'
import type { JsonSchema } from '@ts-pf/docs'
import { defined } from '@ts-pf/protocol'
import {
  type CallInterceptor,
  type ImplementedRouter,
  isImplementedProcedure,
} from '@ts-pf/server'
import { bindToolset, type CallPipelineOptions } from './bind.js'
import { appExecutor } from './executor.js'
import type { MaybePromise } from './infer.js'
import { toolName } from './names.js'
import { DEFAULT_MAX_RESULT_CHARS } from './result.js'
import { procedureSpec, type ToolSpec } from './tool.js'
import { isHidden } from './tool-meta.js'
import type { McpCallInfo, McpTools } from './types.js'

/** Server identity and listing options, for both forms. */
export type McpFactoryOptions = {
  name: string
  version: string
  instructions?: string
  /** `tools/list` cache hint (`cacheScope: 'private'`). Default 0. */
  listTtlMs?: number
}

/** `context` is required when the app carries a `$context` brand; optional for an unbranded tree. */
type ContextOption<Ctx> = unknown extends Ctx
  ? { context?: (info: McpCallInfo) => unknown }
  : { context: (info: McpCallInfo) => MaybePromise<Ctx> }

type AppFactoryOptions<Ctx> = McpFactoryOptions &
  CallPipelineOptions & {
    interceptors?: readonly CallInterceptor[]
  } & ContextOption<Ctx>

/** Advertise our JSON Schema, never re-validate: one validation pass, our messages. */
function passthrough(schema: JsonSchema): StandardSchemaWithJSON {
  return {
    '~standard': {
      version: 1,
      vendor: 'ts-pf',
      validate: (value: unknown) => ({ value }),
      jsonSchema: { input: () => schema, output: () => schema },
    },
  }
}

function isMcpTools(source: unknown): source is McpTools {
  const s = source as Partial<McpTools>
  return typeof s.list === 'function' && typeof s.call === 'function'
}

/** One tool per implemented procedure, named by path; `docs({ hidden: true })` is skipped. */
function appToolSpecs(app: unknown): Record<string, ToolSpec> {
  const tools: Record<string, ToolSpec> = {}
  const visit = (node: unknown, path: string[]) => {
    if (isImplementedProcedure(node)) {
      const spec = procedureSpec(path.join('.'), node['~pf'].contract)
      if (isHidden(spec)) return
      const name = toolName(spec.path)
      if (Object.hasOwn(tools, name)) {
        throw new Error(`createMcpFactory(): duplicate tool name "${name}"`)
      }
      tools[name] = spec
      return
    }
    if (typeof node !== 'object' || node === null) return
    for (const [key, child] of Object.entries(node)) {
      if (key !== '~pf') visit(child, [...path, key])
    }
  }
  visit(app, [])
  return tools
}

function appTools(
  app: ImplementedRouter,
  options: AppFactoryOptions<unknown>,
): McpTools {
  return bindToolset(
    { contract: undefined, tools: appToolSpecs(app), hosts: {} },
    {
      executor: appExecutor(app, options.context, options.interceptors),
      onError: options.onError,
      maxResultChars: options.maxResultChars ?? DEFAULT_MAX_RESULT_CHARS,
    },
  )
}

/**
 * A per-request `McpServer` factory for `createMcpHandler` / `serveStdio`.
 * Pass bound `McpTools` (shaped), or an `app` to expose every procedure.
 * A fresh server per request: one instance cannot serve overlapping requests.
 */
export function createMcpFactory(
  source: McpTools,
  options: McpFactoryOptions,
): McpServerFactory
export function createMcpFactory<T, Ctx>(
  source: ImplementedRouter<T, Ctx>,
  options: AppFactoryOptions<NoInfer<Ctx>>,
): McpServerFactory
export function createMcpFactory(
  source: McpTools | ImplementedRouter,
  options: AppFactoryOptions<unknown>,
): McpServerFactory {
  const tools = isMcpTools(source) ? source : appTools(source, options)
  return async ({ authInfo, requestInfo, era }) => {
    const server = new McpServer(
      { name: options.name, version: options.version },
      defined({
        instructions: options.instructions,
        cacheHints: {
          'tools/list': {
            ttlMs: options.listTtlMs ?? 0,
            cacheScope: 'private' as const,
          },
        },
      }),
    )
    const base: McpCallInfo = defined({ authInfo, requestInfo, era })
    for (const tool of await tools.list(base)) {
      server.registerTool(
        tool.name,
        defined({
          description: tool.description,
          annotations: tool.annotations,
          inputSchema: passthrough(tool.inputSchema),
          outputSchema: tool.outputSchema && passthrough(tool.outputSchema),
        }),
        (args, ctx) =>
          tools.call(
            tool.name,
            args,
            defined({
              ...base,
              authInfo: ctx.http?.authInfo ?? authInfo,
              requestInfo: ctx.http?.req ?? requestInfo,
              signal: ctx.mcpReq.signal,
              inputResponses: ctx.mcpReq.inputResponses,
            }),
          ),
      )
    }
    return server
  }
}
